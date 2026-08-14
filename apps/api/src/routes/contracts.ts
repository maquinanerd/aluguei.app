import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  contractParties,
  contracts,
  contractTemplates,
  parties,
  propertyFinancialTerms,
  propertyOwners,
  properties,
  rentalApplications,
  signatureEnvelopes,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  isContractStatus,
  renderTemplate,
  sha256Hex,
  transitionContract,
} from '@aluguei/domain';
import type { ContractStatus } from '@aluguei/domain';
import {
  contractAggregateSchema,
  contractPartySchema,
  contractSchema,
  createContractRequestSchema,
  listContractsQuerySchema,
  sendForSignatureResponseSchema,
  signatureEnvelopeSchema,
  updateContractStatusRequestSchema,
  updateContractStatusResponseSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type ContractRow = typeof contracts.$inferSelect;

function toContractDto(row: ContractRow): unknown {
  return contractSchema.parse({
    id: row.id,
    orgId: row.orgId,
    templateId: row.templateId,
    applicationId: row.applicationId,
    status: row.status,
    content: row.content,
    contentHash: row.contentHash,
    signedAt: row.signedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function loadContractAggregate(
  db: AppDb,
  orgId: string,
  contractId: string,
): Promise<unknown> {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.orgId, orgId)))
    .limit(1);
  if (!contract) {
    throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
  }
  const [partiesRows, envelopeRows] = await Promise.all([
    db.select().from(contractParties).where(eq(contractParties.contractId, contractId)),
    db
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.contractId, contractId))
      .limit(1),
  ]);
  return contractAggregateSchema.parse({
    contract: toContractDto(contract),
    parties: partiesRows.map((row) =>
      contractPartySchema.parse({
        id: row.id,
        contractId: row.contractId,
        partyId: row.partyId,
        role: row.role,
        signOrder: row.signOrder,
        signedAt: row.signedAt?.toISOString() ?? null,
      }),
    ),
    envelope: envelopeRows[0]
      ? signatureEnvelopeSchema.parse({
          id: envelopeRows[0].id,
          contractId: envelopeRows[0].contractId,
          provider: envelopeRows[0].provider,
          providerEnvelopeId: envelopeRows[0].providerEnvelopeId,
          status: envelopeRows[0].status,
          createdAt: envelopeRows[0].createdAt.toISOString(),
          updatedAt: envelopeRows[0].updatedAt.toISOString(),
        })
      : null,
  });
}

/** Monta variáveis do template a partir de dados estruturados (sem cláusulas de IA). */
async function buildTemplateVariables(
  db: AppDb,
  orgId: string,
  applicationId: string,
): Promise<Record<string, string | number>> {
  const [application] = await db
    .select()
    .from(rentalApplications)
    .where(eq(rentalApplications.id, applicationId))
    .limit(1);
  const [property] = application
    ? await db.select().from(properties).where(eq(properties.id, application.propertyId)).limit(1)
    : [undefined];
  const [terms] = application
    ? await db
        .select()
        .from(propertyFinancialTerms)
        .where(eq(propertyFinancialTerms.propertyId, application.propertyId))
        .limit(1)
    : [undefined];
  const [tenant] = application
    ? await db.select().from(parties).where(eq(parties.id, application.partyId)).limit(1)
    : [undefined];
  const [landlordOwner] = application
    ? await db
        .select()
        .from(propertyOwners)
        .where(eq(propertyOwners.propertyId, application.propertyId))
        .limit(1)
    : [undefined];
  const [landlord] = landlordOwner
    ? await db.select().from(parties).where(eq(parties.id, landlordOwner.partyId)).limit(1)
    : [undefined];

  return {
    tenantName: tenant?.name ?? '—',
    propertyTitle: property?.title ?? '—',
    monthlyRentCents: terms?.monthlyRentCents ?? 0,
    landlordName: landlord?.name ?? '—',
  };
}

export const contractRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/contracts',
    { onRequest: [requirePermission('contract:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createContractRequestSchema.parse(request.body);
      const [application] = await db
        .select()
        .from(rentalApplications)
        .where(
          and(
            eq(rentalApplications.id, input.applicationId),
            eq(rentalApplications.orgId, auth.orgId),
          ),
        )
        .limit(1);
      if (!application) {
        throw new DomainError('NOT_FOUND', 'Candidatura não encontrada');
      }
      if (application.status !== 'APPROVED') {
        throw new DomainError('INVALID_TRANSITION', 'Contrato exige candidatura aprovada');
      }
      const [template] = await db
        .select()
        .from(contractTemplates)
        .where(
          and(
            eq(contractTemplates.id, input.templateId),
            eq(contractTemplates.orgId, auth.orgId),
            eq(contractTemplates.status, 'APPROVED'),
          ),
        )
        .limit(1);
      if (!template) {
        throw new DomainError('INVALID_INPUT', 'Template aprovado não encontrado');
      }
      const contract = first(
        await db
          .insert(contracts)
          .values({
            orgId: auth.orgId,
            templateId: template.id,
            applicationId: application.id,
            createdBy: auth.userId,
          })
          .returning(),
      );
      // Partes: LANDLORD dos property_owners (order 1+) + TENANT (order final)
      const owners = await db
        .select()
        .from(propertyOwners)
        .where(eq(propertyOwners.propertyId, application.propertyId));
      if (owners.length > 0) {
        await db.insert(contractParties).values(
          owners.map((owner, index) => ({
            orgId: auth.orgId,
            contractId: contract.id,
            partyId: owner.partyId,
            role: 'LANDLORD',
            signOrder: index + 1,
          })),
        );
      }
      await db.insert(contractParties).values({
        orgId: auth.orgId,
        contractId: contract.id,
        partyId: application.partyId,
        role: 'TENANT',
        signOrder: owners.length + 1,
      });
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONTRACT_CREATED,
        entityType: 'CONTRACT',
        entityId: contract.id,
      });
      return reply.status(201).send(await loadContractAggregate(db, auth.orgId, contract.id));
    },
  );

  app.get('/contracts', { onRequest: [requirePermission('contract:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listContractsQuerySchema.parse(request.query);
    const where = and(
      eq(contracts.orgId, auth.orgId),
      query.status ? eq(contracts.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(contracts)
      .where(where)
      .orderBy(desc(contracts.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return {
      contracts: rows.map((row) => toContractDto(row)),
      total: rows.length,
    };
  });

  app.get(
    '/contracts/:id',
    { onRequest: [requirePermission('contract:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      return loadContractAggregate(db, auth.orgId, id);
    },
  );

  app.post(
    '/contracts/:id/generate',
    { onRequest: [requirePermission('contract:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [contract] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, id), eq(contracts.orgId, auth.orgId)))
        .limit(1);
      if (!contract) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      if (contract.status === 'GENERATED') {
        return { contract: await loadContractAggregate(db, auth.orgId, id) };
      }
      const [template] = contract.templateId
        ? await db
            .select()
            .from(contractTemplates)
            .where(eq(contractTemplates.id, contract.templateId))
            .limit(1)
        : [undefined];
      if (!template || template.status !== 'APPROVED') {
        throw new DomainError('INVALID_INPUT', 'Template aprovado não encontrado');
      }
      const variables = contract.applicationId
        ? await buildTemplateVariables(db, auth.orgId, contract.applicationId)
        : {};
      const content = renderTemplate(template.body, variables);
      const contentHash = sha256Hex(content);
      transitionContract('DRAFT', 'GENERATED', {
        hasContentAndHash: true,
        hasEnvelope: false,
        allPartiesSigned: false,
      });
      const updated = first(
        await db
          .update(contracts)
          .set({ status: 'GENERATED', content, contentHash, updatedAt: new Date() })
          .where(eq(contracts.id, contract.id))
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONTRACT_GENERATED,
        entityType: 'CONTRACT',
        entityId: contract.id,
        payload: { contentHash },
      });
      return { contract: await loadContractAggregate(db, auth.orgId, updated.id) };
    },
  );

  app.post(
    '/contracts/:id/send-for-signature',
    { onRequest: [requirePermission('contract:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      if (!app.signature) {
        throw new DomainError('INVALID_INPUT', 'Assinatura não configurada');
      }
      const [contract] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, id), eq(contracts.orgId, auth.orgId)))
        .limit(1);
      if (!contract) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      if (contract.status !== 'GENERATED') {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Gere o documento antes de enviar para assinatura',
        );
      }
      const [existingEnvelope] = await db
        .select()
        .from(signatureEnvelopes)
        .where(eq(signatureEnvelopes.contractId, contract.id))
        .limit(1);
      if (existingEnvelope) {
        return reply.status(200).send(
          sendForSignatureResponseSchema.parse({
            envelope: {
              id: existingEnvelope.id,
              contractId: existingEnvelope.contractId,
              provider: existingEnvelope.provider,
              providerEnvelopeId: existingEnvelope.providerEnvelopeId,
              status: existingEnvelope.status,
              createdAt: existingEnvelope.createdAt.toISOString(),
              updatedAt: existingEnvelope.updatedAt.toISOString(),
            },
          }),
        );
      }
      const partiesRows = await db
        .select()
        .from(contractParties)
        .where(eq(contractParties.contractId, contract.id));
      const envelopeResult = await app.signature.createEnvelope({
        contractId: contract.id,
        parties: partiesRows.map((row) => ({
          partyId: row.partyId ?? '',
          role: row.role as 'LANDLORD' | 'TENANT' | 'GUARANTOR',
          signOrder: row.signOrder,
        })),
        documentRef: contract.contentHash ?? contract.id,
      });
      const envelope = first(
        await db
          .insert(signatureEnvelopes)
          .values({
            orgId: auth.orgId,
            contractId: contract.id,
            provider: 'FAKE',
            providerEnvelopeId: envelopeResult.providerEnvelopeId,
            status: 'SENT',
          })
          .returning(),
      );
      transitionContract('GENERATED', 'SENT_FOR_SIGNATURE', {
        hasContentAndHash: true,
        hasEnvelope: true,
        allPartiesSigned: false,
      });
      await db
        .update(contracts)
        .set({ status: 'SENT_FOR_SIGNATURE', updatedAt: new Date() })
        .where(eq(contracts.id, contract.id));
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONTRACT_SENT_FOR_SIGNATURE,
        entityType: 'CONTRACT',
        entityId: contract.id,
      });
      return reply.status(201).send(
        sendForSignatureResponseSchema.parse({
          envelope: {
            id: envelope.id,
            contractId: envelope.contractId,
            provider: envelope.provider,
            providerEnvelopeId: envelope.providerEnvelopeId,
            status: envelope.status,
            createdAt: envelope.createdAt.toISOString(),
            updatedAt: envelope.updatedAt.toISOString(),
          },
        }),
      );
    },
  );

  app.patch(
    '/contracts/:id/status',
    { onRequest: [requirePermission('contract:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateContractStatusRequestSchema.parse(request.body);
      const [contract] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, id), eq(contracts.orgId, auth.orgId)))
        .limit(1);
      if (!contract) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      if (!isContractStatus(contract.status)) {
        throw new Error('contract status inválido');
      }
      transitionContract(contract.status as ContractStatus, input.status, {
        hasContentAndHash: true,
        hasEnvelope: true,
        allPartiesSigned: false,
      });
      const updated = first(
        await db
          .update(contracts)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(contracts.id, contract.id))
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONTRACT_VOIDED,
        entityType: 'CONTRACT',
        entityId: contract.id,
      });
      return updateContractStatusResponseSchema.parse(
        await loadContractAggregate(db, auth.orgId, updated.id),
      );
    },
  );

  return Promise.resolve();
};
