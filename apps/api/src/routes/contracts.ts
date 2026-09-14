import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  contractParties,
  contracts,
  contractTemplates,
  contractVersions,
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
  assertContractContentWritable,
  isContractStatus,
  renderTemplate,
  sha256Hex,
  transitionContract,
  transitionRentalApplication,
} from '@aluguei/domain';
import type { ContractStatus } from '@aluguei/domain';
import {
  contractAggregateSchema,
  contractPartySchema,
  contractSchema,
  contractVersionSchema,
  createContractRequestSchema,
  generateContractRequestSchema,
  listContractVersionsResponseSchema,
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
type EnvelopeRow = typeof signatureEnvelopes.$inferSelect;
type VersionRow = typeof contractVersions.$inferSelect;

function toContractDto(row: ContractRow): unknown {
  return contractSchema.parse({
    id: row.id,
    orgId: row.orgId,
    templateId: row.templateId,
    applicationId: row.applicationId,
    status: row.status,
    content: row.content,
    contentHash: row.contentHash,
    currentVersion: row.currentVersion,
    signedAt: row.signedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toEnvelopeDto(row: EnvelopeRow): unknown {
  return signatureEnvelopeSchema.parse({
    id: row.id,
    contractId: row.contractId,
    provider: row.provider,
    providerEnvelopeId: row.providerEnvelopeId,
    contractVersion: row.contractVersion,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toVersionDto(row: VersionRow): unknown {
  return contractVersionSchema.parse({
    id: row.id,
    contractId: row.contractId,
    version: row.version,
    content: row.content,
    contentHash: row.contentHash,
    templateId: row.templateId,
    templateVersion: row.templateVersion,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  });
}

function contractStatusOf(row: ContractRow): ContractStatus {
  if (!isContractStatus(row.status)) {
    throw new Error(`status de contrato inválido: ${row.status}`);
  }
  return row.status;
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
    envelope: envelopeRows[0] ? toEnvelopeDto(envelopeRows[0]) : null,
  });
}

/** Monta variáveis do template a partir de dados estruturados (sem cláusulas de IA). */
async function buildTemplateVariables(
  db: AppDb,
  orgId: string,
  applicationId: string,
): Promise<Record<string, string | number>> {
  // P0-05 (defesa em profundidade): toda leitura derivada é filtrada pela org.
  const [application] = await db
    .select()
    .from(rentalApplications)
    .where(and(eq(rentalApplications.id, applicationId), eq(rentalApplications.orgId, orgId)))
    .limit(1);
  const [property] = application
    ? await db
        .select()
        .from(properties)
        .where(and(eq(properties.id, application.propertyId), eq(properties.orgId, orgId)))
        .limit(1)
    : [undefined];
  const [terms] = application
    ? await db
        .select()
        .from(propertyFinancialTerms)
        .where(
          and(
            eq(propertyFinancialTerms.propertyId, application.propertyId),
            eq(propertyFinancialTerms.orgId, orgId),
          ),
        )
        .limit(1)
    : [undefined];
  const [tenant] = application
    ? await db
        .select()
        .from(parties)
        .where(and(eq(parties.id, application.partyId), eq(parties.orgId, orgId)))
        .limit(1)
    : [undefined];
  const [landlordOwner] = application
    ? await db
        .select()
        .from(propertyOwners)
        .where(
          and(
            eq(propertyOwners.propertyId, application.propertyId),
            eq(propertyOwners.orgId, orgId),
          ),
        )
        .limit(1)
    : [undefined];
  const [landlord] = landlordOwner
    ? await db
        .select()
        .from(parties)
        .where(and(eq(parties.id, landlordOwner.partyId), eq(parties.orgId, orgId)))
        .limit(1)
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
        throw new DomainError(
          'INVALID_TRANSITION',
          application.status === 'CONTRACTING'
            ? 'Candidatura já está em contratação: cancele o contrato atual para gerar outro'
            : 'Contrato exige candidatura aprovada',
        );
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
      // P1-06: criar o contrato é o que leva a candidatura a CONTRACTING.
      transitionRentalApplication('APPROVED', 'CONTRACTING', {
        source: 'CONTRACT',
        hasConsent: true,
        hasRequiredData: true,
        hasDecisionReason: true,
        hasDecidedBy: false,
        hasScreeningResult: true,
        hasContract: true,
      });
      const contract = await db.transaction(async (tx) => {
        // Compare-and-set: dois pedidos simultâneos não geram dois contratos.
        const [moved] = await tx
          .update(rentalApplications)
          .set({ status: 'CONTRACTING', updatedAt: new Date() })
          .where(
            and(
              eq(rentalApplications.id, application.id),
              eq(rentalApplications.orgId, auth.orgId),
              eq(rentalApplications.status, 'APPROVED'),
            ),
          )
          .returning({ id: rentalApplications.id });
        if (!moved) {
          throw new DomainError('INVALID_TRANSITION', 'Contrato exige candidatura aprovada');
        }
        const created = first(
          await tx
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
        const owners = await tx
          .select()
          .from(propertyOwners)
          .where(
            and(
              eq(propertyOwners.propertyId, application.propertyId),
              eq(propertyOwners.orgId, auth.orgId),
            ),
          );
        if (owners.length > 0) {
          await tx.insert(contractParties).values(
            owners.map((owner, index) => ({
              orgId: auth.orgId,
              contractId: created.id,
              partyId: owner.partyId,
              role: 'LANDLORD',
              signOrder: index + 1,
            })),
          );
        }
        await tx.insert(contractParties).values({
          orgId: auth.orgId,
          contractId: created.id,
          partyId: application.partyId,
          role: 'TENANT',
          signOrder: owners.length + 1,
        });
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.CONTRACT_CREATED,
          entityType: 'CONTRACT',
          entityId: created.id,
        });
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.RENTAL_APPLICATION_DECIDED,
          entityType: 'RENTAL_APPLICATION',
          entityId: application.id,
          payload: {
            from: 'APPROVED',
            to: 'CONTRACTING',
            source: 'CONTRACT',
            contractId: created.id,
          },
        });
        return created;
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

  app.get(
    '/contracts/:id/versions',
    { onRequest: [requirePermission('contract:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [contract] = await db
        .select({ id: contracts.id })
        .from(contracts)
        .where(and(eq(contracts.id, id), eq(contracts.orgId, auth.orgId)))
        .limit(1);
      if (!contract) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      const rows = await db
        .select()
        .from(contractVersions)
        .where(and(eq(contractVersions.contractId, id), eq(contractVersions.orgId, auth.orgId)))
        .orderBy(asc(contractVersions.version));
      return listContractVersionsResponseSchema.parse({
        versions: rows.map((row) => toVersionDto(row)),
      });
    },
  );

  app.post(
    '/contracts/:id/generate',
    { onRequest: [requirePermission('contract:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = generateContractRequestSchema.parse(request.body ?? {});
      const [contract] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, id), eq(contracts.orgId, auth.orgId)))
        .limit(1);
      if (!contract) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      const status = contractStatusOf(contract);
      // P0-04: a partir do envio para assinatura o texto é imutável — nenhuma
      // escrita, com ou sem pedido explícito de regeneração.
      assertContractContentWritable(status);
      if (status === 'GENERATED' && input.regenerate !== true) {
        // Repetir a geração é idempotente: devolve a versão vigente.
        return { contract: await loadContractAggregate(db, auth.orgId, id) };
      }
      const [template] = contract.templateId
        ? await db
            .select()
            .from(contractTemplates)
            .where(
              and(
                eq(contractTemplates.id, contract.templateId),
                eq(contractTemplates.orgId, auth.orgId),
              ),
            )
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
      transitionContract(status, 'GENERATED', {
        hasContentAndHash: true,
        hasEnvelope: false,
        allPartiesSigned: false,
      });
      await db.transaction(async (tx) => {
        // Trava e revalida: um envio ou outra geração concorrente pode ter
        // mudado o contrato entre a leitura acima e esta escrita.
        const [locked] = await tx
          .select()
          .from(contracts)
          .where(and(eq(contracts.id, id), eq(contracts.orgId, auth.orgId)))
          .for('update');
        if (!locked) {
          throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
        }
        assertContractContentWritable(contractStatusOf(locked));
        if (
          locked.status !== contract.status ||
          locked.currentVersion !== contract.currentVersion
        ) {
          throw new DomainError('CONFLICT', 'Contrato alterado durante a geração; tente novamente');
        }
        if (locked.status === 'GENERATED') {
          const [envelope] = await tx
            .select({ id: signatureEnvelopes.id })
            .from(signatureEnvelopes)
            .where(eq(signatureEnvelopes.contractId, locked.id))
            .limit(1);
          if (envelope) {
            throw new DomainError(
              'INVALID_TRANSITION',
              'Contrato já enviado ao provider de assinatura: o conteúdo não pode ser gerado novamente',
            );
          }
          if (locked.contentHash === contentHash) {
            return; // mesmo texto: nenhuma versão nova
          }
        }
        const version = (locked.currentVersion ?? 0) + 1;
        await tx.insert(contractVersions).values({
          orgId: auth.orgId,
          contractId: locked.id,
          version,
          content,
          contentHash,
          templateId: template.id,
          templateVersion: template.version,
          createdBy: auth.userId,
        });
        await tx
          .update(contracts)
          .set({
            status: 'GENERATED',
            content,
            contentHash,
            currentVersion: version,
            updatedAt: new Date(),
          })
          .where(and(eq(contracts.id, locked.id), eq(contracts.status, locked.status)));
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.CONTRACT_GENERATED,
          entityType: 'CONTRACT',
          entityId: locked.id,
          payload: { contentHash, version, regenerated: locked.status === 'GENERATED' },
        });
      });
      return { contract: await loadContractAggregate(db, auth.orgId, id) };
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
        return reply
          .status(200)
          .send(
            sendForSignatureResponseSchema.parse({ envelope: toEnvelopeDto(existingEnvelope) }),
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
      const envelope = await db.transaction(async (tx) => {
        // O texto enviado ao provider é o da versão lida acima: se outra
        // requisição regenerou o contrato durante a chamada, nada é gravado.
        const [locked] = await tx
          .select()
          .from(contracts)
          .where(and(eq(contracts.id, contract.id), eq(contracts.orgId, auth.orgId)))
          .for('update');
        if (
          !locked ||
          locked.status !== 'GENERATED' ||
          locked.currentVersion !== contract.currentVersion ||
          locked.contentHash !== contract.contentHash
        ) {
          throw new DomainError(
            'CONFLICT',
            'Contrato alterado durante o envio para assinatura; envie novamente',
          );
        }
        transitionContract('GENERATED', 'SENT_FOR_SIGNATURE', {
          hasContentAndHash: true,
          hasEnvelope: true,
          allPartiesSigned: false,
        });
        const created = first(
          await tx
            .insert(signatureEnvelopes)
            .values({
              orgId: auth.orgId,
              contractId: locked.id,
              provider: 'FAKE',
              providerEnvelopeId: envelopeResult.providerEnvelopeId,
              contractVersion: locked.currentVersion,
              status: 'SENT',
            })
            .returning(),
        );
        await tx
          .update(contracts)
          .set({ status: 'SENT_FOR_SIGNATURE', updatedAt: new Date() })
          .where(and(eq(contracts.id, locked.id), eq(contracts.status, 'GENERATED')));
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.CONTRACT_SENT_FOR_SIGNATURE,
          entityType: 'CONTRACT',
          entityId: locked.id,
          payload: { version: locked.currentVersion, contentHash: locked.contentHash },
        });
        return created;
      });
      return reply
        .status(201)
        .send(sendForSignatureResponseSchema.parse({ envelope: toEnvelopeDto(envelope) }));
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
      const updated = await db.transaction(async (tx) => {
        const [voided] = await tx
          .update(contracts)
          .set({ status: input.status, updatedAt: new Date() })
          .where(and(eq(contracts.id, contract.id), eq(contracts.status, contract.status)))
          .returning();
        if (!voided) {
          throw new DomainError(
            'CONFLICT',
            'Contrato alterado por outra operação; recarregue e tente novamente',
          );
        }
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.CONTRACT_VOIDED,
          entityType: 'CONTRACT',
          entityId: voided.id,
        });
        if (voided.applicationId) {
          // P1-06: sem contrato ativo, a candidatura volta a aguardar contrato.
          const [active] = await tx
            .select({ id: contracts.id })
            .from(contracts)
            .where(
              and(
                eq(contracts.orgId, auth.orgId),
                eq(contracts.applicationId, voided.applicationId),
                ne(contracts.status, 'VOID'),
              ),
            )
            .limit(1);
          const [application] = await tx
            .select({ status: rentalApplications.status })
            .from(rentalApplications)
            .where(
              and(
                eq(rentalApplications.id, voided.applicationId),
                eq(rentalApplications.orgId, auth.orgId),
              ),
            )
            .limit(1);
          if (!active && application?.status === 'CONTRACTING') {
            transitionRentalApplication('CONTRACTING', 'APPROVED', {
              source: 'CONTRACT',
              hasConsent: true,
              hasRequiredData: true,
              hasDecisionReason: true,
              hasDecidedBy: false,
              hasScreeningResult: true,
              hasContract: false,
            });
            await tx
              .update(rentalApplications)
              .set({ status: 'APPROVED', updatedAt: new Date() })
              .where(
                and(
                  eq(rentalApplications.id, voided.applicationId),
                  eq(rentalApplications.orgId, auth.orgId),
                  eq(rentalApplications.status, 'CONTRACTING'),
                ),
              );
            await writeAudit(tx, {
              orgId: auth.orgId,
              actorUserId: auth.userId,
              action: AUDIT_ACTIONS.RENTAL_APPLICATION_DECIDED,
              entityType: 'RENTAL_APPLICATION',
              entityId: voided.applicationId,
              payload: {
                from: 'CONTRACTING',
                to: 'APPROVED',
                source: 'CONTRACT',
                contractId: voided.id,
              },
            });
          }
        }
        return voided;
      });
      return updateContractStatusResponseSchema.parse(
        await loadContractAggregate(db, auth.orgId, updated.id),
      );
    },
  );

  return Promise.resolve();
};
