import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '@aluguei/db';
import {
  charges,
  contracts,
  inspections,
  inspectionMedia,
  inspectionObservations,
  inspectionRooms,
  leases,
  organizations,
  parties,
  payments,
  portalAccess,
  portalSessions,
  properties,
  propertyOwners,
  signatureEnvelopes,
  splitAllocations,
} from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  buildLandlordStatement,
  buildTenantStatement,
} from '@aluguei/domain';
import {
  consumePortalTokenRequestSchema,
  createPortalAccessRequestSchema,
  createPortalAccessResponseSchema,
  landlordStatementSchema,
  listPortalChargesQuerySchema,
  portalChargeSchema,
  portalContractSchema,
  portalInspectionReportSchema,
  portalPropertySchema,
  portalSessionResponseSchema,
  tenantStatementSchema,
  uuidSchema,
} from '@aluguei/contracts';
import {
  requireAuth,
  requirePermission,
  requirePortalAuth,
  requirePortalKind,
} from '../plugins/authz.js';
import {
  generatePortalToken,
  hashPortalToken,
  setPortalCookie,
} from '../plugins/portal-session.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

const PORTAL_SESSION_TTL_SECONDS = 7 * 24 * 3600; // 7 dias
const ONE_TIME_TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;

function toPortalChargeDto(row: typeof charges.$inferSelect): unknown {
  return portalChargeSchema.parse({
    id: row.id,
    periodStart: row.periodStart,
    dueDate: row.dueDate,
    status: row.status,
    amountCents: row.amountCents,
    lateFeeCents: row.lateFeeCents,
    interestCents: row.interestCents,
    paidAt: row.paidAt?.toISOString() ?? null,
  });
}

async function loadPartyName(db: AppDb, partyId: string): Promise<string> {
  const [party] = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
  return party?.name ?? 'Parte';
}

export const portalRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  // ---- Concessão de acesso (RBAC interno) ----

  app.post(
    '/portal/access',
    { onRequest: [requirePermission('portal:manage')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createPortalAccessRequestSchema.parse(request.body);

      const [party] = await db
        .select()
        .from(parties)
        .where(and(eq(parties.id, input.partyId), eq(parties.orgId, auth.orgId)))
        .limit(1);
      if (!party) {
        throw new DomainError('NOT_FOUND', 'Parte não encontrada');
      }

      // Uma concessão ativa por (org, party, kind). Reutiliza a existente.
      const [existing] = await db
        .select()
        .from(portalAccess)
        .where(
          and(
            eq(portalAccess.orgId, auth.orgId),
            eq(portalAccess.partyId, party.id),
            eq(portalAccess.kind, input.kind),
          ),
        )
        .limit(1);

      if (existing && !existing.revokedAt) {
        // Já existe ativa: gera um novo token one-time para a mesma concessão.
        const token = generatePortalToken();
        await db
          .update(portalAccess)
          .set({
            oneTimeTokenHash: hashPortalToken(token),
            oneTimeTokenExpiresAt: new Date(Date.now() + ONE_TIME_TOKEN_TTL_MS),
            revokedAt: null,
          })
          .where(eq(portalAccess.id, existing.id));
        await writeAudit(db, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PORTAL_ACCESS_CREATED,
          entityType: 'PORTAL_ACCESS',
          entityId: existing.id,
          payload: { partyId: party.id, kind: input.kind },
        });
        return reply.status(201).send(
          createPortalAccessResponseSchema.parse({
            access: { id: existing.id, kind: input.kind, partyId: party.id },
            oneTimeToken: token,
          }),
        );
      }

      const access = first(
        await db
          .insert(portalAccess)
          .values({
            orgId: auth.orgId,
            partyId: party.id,
            kind: input.kind,
            createdBy: auth.userId,
            oneTimeTokenHash: null,
          })
          .returning(),
      );
      const token = generatePortalToken();
      await db
        .update(portalAccess)
        .set({
          oneTimeTokenHash: hashPortalToken(token),
          oneTimeTokenExpiresAt: new Date(Date.now() + ONE_TIME_TOKEN_TTL_MS),
        })
        .where(eq(portalAccess.id, access.id));
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PORTAL_ACCESS_CREATED,
        entityType: 'PORTAL_ACCESS',
        entityId: access.id,
        payload: { partyId: party.id, kind: input.kind },
      });
      return reply.status(201).send(
        createPortalAccessResponseSchema.parse({
          access: { id: access.id, kind: input.kind, partyId: party.id },
          oneTimeToken: token,
        }),
      );
    },
  );

  app.post(
    '/portal/access/:id/revoke',
    { onRequest: [requirePermission('portal:manage')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [access] = await db
        .select()
        .from(portalAccess)
        .where(and(eq(portalAccess.id, id), eq(portalAccess.orgId, auth.orgId)))
        .limit(1);
      if (!access) {
        throw new DomainError('NOT_FOUND', 'Concessão não encontrada');
      }
      if (!access.revokedAt) {
        await db
          .update(portalAccess)
          .set({ revokedAt: new Date(), oneTimeTokenHash: null })
          .where(eq(portalAccess.id, access.id));
        // Revoga todas as sessões ativas da concessão.
        await db
          .update(portalSessions)
          .set({ revokedAt: new Date() })
          .where(eq(portalSessions.accessId, access.id));
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PORTAL_ACCESS_REVOKED,
        entityType: 'PORTAL_ACCESS',
        entityId: access.id,
      });
      return { ok: true };
    },
  );

  // ---- Sessão do portal (sem RBAC interno; token one-time) ----

  app.post(
    '/portal/auth/consume',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = consumePortalTokenRequestSchema.parse(request.body);
      const tokenHash = hashPortalToken(input.token);

      const [access] = await db
        .select()
        .from(portalAccess)
        .where(and(eq(portalAccess.oneTimeTokenHash, tokenHash), isNull(portalAccess.revokedAt)))
        .limit(1);
      if (!access || !access.oneTimeTokenExpiresAt || access.oneTimeTokenExpiresAt < new Date()) {
        throw new DomainError('UNAUTHORIZED', 'Token de acesso inválido ou expirado');
      }

      // Consumo único: limpa o hash ANTES de criar a sessão.
      await db
        .update(portalAccess)
        .set({ oneTimeTokenHash: null })
        .where(eq(portalAccess.id, access.id));

      const sessionToken = generatePortalToken();
      await db.insert(portalSessions).values({
        orgId: access.orgId,
        partyId: access.partyId,
        accessId: access.id,
        tokenHash: hashPortalToken(sessionToken),
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
        expiresAt: new Date(Date.now() + PORTAL_SESSION_TTL_SECONDS * 1000),
      });

      const secure = process.env.NODE_ENV === 'production';
      setPortalCookie(reply, 'aluguei_portal', sessionToken, PORTAL_SESSION_TTL_SECONDS, secure);
      await writeAudit(db, {
        orgId: access.orgId,
        action: AUDIT_ACTIONS.PORTAL_LOGIN,
        entityType: 'PORTAL_SESSION',
        entityId: access.id,
        payload: { partyId: access.partyId, kind: access.kind },
      });
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, access.orgId))
        .limit(1);
      const [party] = await db
        .select()
        .from(parties)
        .where(eq(parties.id, access.partyId))
        .limit(1);
      return reply.status(200).send(
        portalSessionResponseSchema.parse({
          partyId: access.partyId,
          partyName: party?.name ?? 'Parte',
          kind: access.kind,
          orgId: access.orgId,
          orgName: org?.name ?? '',
        }),
      );
    },
  );

  app.post('/portal/auth/logout', async (request, reply) => {
    const portal = request.portalAuth;
    reply.clearCookie('aluguei_portal', { path: '/' });
    if (portal) {
      await writeAudit(db, {
        orgId: portal.orgId,
        action: AUDIT_ACTIONS.PORTAL_LOGOUT,
        entityType: 'PORTAL_SESSION',
        entityId: 'logout',
        payload: { partyId: portal.partyId },
      });
    }
    return { ok: true };
  });

  app.get('/portal/me', async (request) => {
    const portal = requirePortalAuth(request);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, portal.orgId))
      .limit(1);
    const partyName = await loadPartyName(db, portal.partyId);
    return portalSessionResponseSchema.parse({
      partyId: portal.partyId,
      partyName,
      kind: portal.kind,
      orgId: portal.orgId,
      orgName: org?.name ?? '',
    });
  });

  // ---- Locatário ----

  async function tenantLeases(orgId: string, partyId: string) {
    return db
      .select()
      .from(leases)
      .where(and(eq(leases.orgId, orgId), eq(leases.tenantPartyId, partyId)));
  }

  app.get(
    '/portal/tenant/statement',
    { onRequest: [requirePortalKind('TENANT')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const leasesRows = await tenantLeases(portal.orgId, portal.partyId);
      const leaseIds = leasesRows.map((l) => l.id);
      if (leaseIds.length === 0) {
        return tenantStatementSchema.parse({
          totals: { billedCents: 0, paidCents: 0, openCents: 0 },
          charges: [],
          payments: [],
        });
      }
      const chargeRows = await db
        .select()
        .from(charges)
        .where(inArray(charges.leaseId, leaseIds))
        .orderBy(desc(charges.dueDate));
      const chargeIds = chargeRows.map((c) => c.id);
      const paymentRows =
        chargeIds.length > 0
          ? await db
              .select()
              .from(payments)
              .where(inArray(payments.chargeId, chargeIds))
              .orderBy(desc(payments.createdAt))
          : [];
      const statement = buildTenantStatement(
        chargeRows.map((c) => ({
          id: c.id,
          periodStart: c.periodStart,
          dueDate: c.dueDate,
          status: c.status,
          amountCents: c.amountCents,
          lateFeeCents: c.lateFeeCents,
          interestCents: c.interestCents,
          paidAt: c.paidAt?.toISOString() ?? null,
        })),
        paymentRows.map((p) => ({
          id: p.id,
          chargeId: p.chargeId,
          amountCents: p.amountCents,
          method: p.method,
          status: p.status,
          paidAt: p.paidAt?.toISOString() ?? null,
        })),
      );
      return tenantStatementSchema.parse(statement);
    },
  );

  app.get(
    '/portal/tenant/charges',
    { onRequest: [requirePortalKind('TENANT')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const query = listPortalChargesQuerySchema.parse(request.query);
      const leasesRows = await tenantLeases(portal.orgId, portal.partyId);
      const leaseIds = leasesRows.map((l) => l.id);
      if (leaseIds.length === 0) {
        return { charges: [], total: 0 };
      }
      const where = and(
        inArray(charges.leaseId, leaseIds),
        query.status ? eq(charges.status, query.status) : undefined,
      );
      const rows = await db
        .select()
        .from(charges)
        .where(where)
        .orderBy(desc(charges.dueDate))
        .limit(query.limit)
        .offset(query.offset);
      const [totalRow] = await db.select({ count: charges.id }).from(charges).where(where);
      return {
        charges: rows.map((row) => toPortalChargeDto(row)),
        total: (totalRow as unknown as { count: number } | undefined)?.count ?? rows.length,
      };
    },
  );

  app.get(
    '/portal/tenant/contracts',
    { onRequest: [requirePortalKind('TENANT')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const leasesRows = await tenantLeases(portal.orgId, portal.partyId);
      const contractIds = leasesRows.map((l) => l.contractId).filter(Boolean);
      if (contractIds.length === 0) {
        return { contracts: [] };
      }
      const rows = await db
        .select()
        .from(contracts)
        .where(
          and(eq(contracts.orgId, portal.orgId), inArray(contracts.id, contractIds as string[])),
        )
        .orderBy(desc(contracts.createdAt));
      return { contracts: rows.map((row) => toPortalContract(row, null)) };
    },
  );

  app.get(
    '/portal/tenant/contracts/:id',
    { onRequest: [requirePortalKind('TENANT')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const leasesRows = await tenantLeases(portal.orgId, portal.partyId);
      const contractIds = leasesRows.map((l) => l.contractId);
      if (!contractIds.includes(id)) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      const [row] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, id), eq(contracts.orgId, portal.orgId)))
        .limit(1);
      if (!row) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      const [envelope] = await db
        .select()
        .from(signatureEnvelopes)
        .where(eq(signatureEnvelopes.contractId, row.id))
        .limit(1);
      return toPortalContract(row, envelope?.status ?? null);
    },
  );

  app.get(
    '/portal/tenant/inspections',
    { onRequest: [requirePortalKind('TENANT')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const leasesRows = await tenantLeases(portal.orgId, portal.partyId);
      const propertyIds = [...new Set(leasesRows.map((l) => l.propertyId))];
      if (propertyIds.length === 0) {
        return { inspections: [] };
      }
      const rows = await db
        .select()
        .from(inspections)
        .where(
          and(eq(inspections.orgId, portal.orgId), inArray(inspections.propertyId, propertyIds)),
        )
        .orderBy(desc(inspections.createdAt));
      return { inspections: await Promise.all(rows.map((row) => toPortalInspection(db, row))) };
    },
  );

  app.post(
    '/portal/tenant/charges/:id/payment',
    { onRequest: [requirePortalKind('TENANT')] },
    async (request, reply) => {
      const portal = requirePortalAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const leasesRows = await tenantLeases(portal.orgId, portal.partyId);
      const leaseIds = leasesRows.map((l) => l.id);
      const [charge] = await db
        .select()
        .from(charges)
        .where(and(inArray(charges.leaseId, leaseIds), eq(charges.id, id)))
        .limit(1);
      if (!charge) {
        throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
      }
      if (charge.status === 'PAID' || charge.status === 'CANCELLED') {
        throw new DomainError('INVALID_TRANSITION', `Cobrança ${charge.status} não pode ser paga`);
      }
      const paymentProvider = app.payments;
      if (!paymentProvider) {
        throw new DomainError('INVALID_INPUT', 'Pagamento não configurado');
      }
      // Idempotente: payment PENDING existente para a charge é reutilizado.
      const [existingPayment] = await db
        .select()
        .from(payments)
        .where(eq(payments.chargeId, charge.id))
        .limit(1);
      if (existingPayment && existingPayment.status === 'PENDING') {
        return reply.status(200).send({
          payment: toPaymentDto(existingPayment),
          pixQrCode: charge.providerChargeId ? `000201-qr-${charge.providerChargeId}` : null,
          boletoUrl: null,
          providerChargeId: charge.providerChargeId,
        });
      }
      const created = await paymentProvider.createCharge({
        amountCents: charge.amountCents,
        description: `Aluguel ${charge.periodStart}`,
        dueDate: charge.dueDate,
      });
      const payment = first(
        await db
          .insert(payments)
          .values({
            orgId: portal.orgId,
            chargeId: charge.id,
            amountCents: charge.amountCents,
            method: 'PIX',
            status: 'PENDING',
          })
          .returning(),
      );
      await db
        .update(charges)
        .set({ providerChargeId: created.providerChargeId, updatedAt: new Date() })
        .where(eq(charges.id, charge.id));
      await writeAudit(db, {
        orgId: portal.orgId,
        action: AUDIT_ACTIONS.PAYMENT_INITIATED,
        entityType: 'CHARGE',
        entityId: charge.id,
        payload: { paymentId: payment.id, via: 'portal' },
      });
      return reply.status(201).send({
        payment: toPaymentDto(payment),
        pixQrCode: created.pixQrCode ?? null,
        boletoUrl: created.boletoUrl ?? null,
        providerChargeId: created.providerChargeId,
      });
    },
  );

  // ---- Proprietário ----

  app.get(
    '/portal/landlord/properties',
    { onRequest: [requirePortalKind('LANDLORD')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const ownerRows = await db
        .select({ propertyId: propertyOwners.propertyId })
        .from(propertyOwners)
        .where(
          and(eq(propertyOwners.orgId, portal.orgId), eq(propertyOwners.partyId, portal.partyId)),
        );
      const propertyIds = ownerRows.map((o) => o.propertyId);
      if (propertyIds.length === 0) {
        return { properties: [] };
      }
      const rows = await db
        .select()
        .from(properties)
        .where(and(eq(properties.orgId, portal.orgId), inArray(properties.id, propertyIds)))
        .orderBy(desc(properties.createdAt));
      return {
        properties: rows.map((row) =>
          portalPropertySchema.parse({ id: row.id, title: row.title, status: row.status }),
        ),
      };
    },
  );

  app.get(
    '/portal/landlord/statement',
    { onRequest: [requirePortalKind('LANDLORD')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const query = z
        .object({
          propertyId: uuidSchema.optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .parse(request.query);

      // Leases onde o proprietário é landlord (para escopo por imóvel).
      const ownerRows = await db
        .select({ propertyId: propertyOwners.propertyId })
        .from(propertyOwners)
        .where(
          and(eq(propertyOwners.orgId, portal.orgId), eq(propertyOwners.partyId, portal.partyId)),
        );
      const ownedIds = ownerRows.map((o) => o.propertyId);
      if (query.propertyId && !ownedIds.includes(query.propertyId)) {
        throw new DomainError('NOT_FOUND', 'Imóvel não encontrado');
      }
      const targetPropertyIds = query.propertyId ? [query.propertyId] : ownedIds;
      if (targetPropertyIds.length === 0) {
        return landlordStatementSchema.parse({
          propertyId: query.propertyId ?? null,
          totals: { allocatedCents: 0, paidOutCents: 0, pendingCents: 0 },
          allocations: [],
        });
      }

      const leaseRows = await db
        .select()
        .from(leases)
        .where(
          and(
            eq(leases.orgId, portal.orgId),
            eq(leases.landlordPartyId, portal.partyId),
            inArray(leases.propertyId, targetPropertyIds),
          ),
        );
      const leaseIds = leaseRows.map((l) => l.id);
      if (leaseIds.length === 0) {
        return landlordStatementSchema.parse({
          propertyId: query.propertyId ?? null,
          totals: { allocatedCents: 0, paidOutCents: 0, pendingCents: 0 },
          allocations: [],
        });
      }
      const chargeRows = await db.select().from(charges).where(inArray(charges.leaseId, leaseIds));
      const chargeIds = chargeRows.map((c) => c.id);
      // Filtra corretamente pelos payments das charges (evita subquery duplicada).
      const paymentRows =
        chargeIds.length > 0
          ? await db.select().from(payments).where(inArray(payments.chargeId, chargeIds))
          : [];
      const paymentIds = paymentRows.map((p) => p.id);
      const finalAllocs =
        paymentIds.length > 0
          ? await db
              .select()
              .from(splitAllocations)
              .where(
                and(
                  eq(splitAllocations.orgId, portal.orgId),
                  eq(splitAllocations.partyId, portal.partyId),
                  eq(splitAllocations.role, 'LANDLORD'),
                  inArray(splitAllocations.paymentId, paymentIds),
                ),
              )
          : [];

      const periodFilter = (value: string): boolean => {
        if (query.from && value < query.from) {
          return false;
        }
        if (query.to && value > query.to) {
          return false;
        }
        return true;
      };

      const allocations = finalAllocs
        .map((a) => {
          const payment = paymentRows.find((p) => p.id === a.paymentId);
          const charge = payment ? chargeRows.find((c) => c.id === payment.chargeId) : undefined;
          return {
            id: a.id,
            amountCents: a.amountCents,
            chargePeriodStart: charge?.periodStart ?? null,
            payoutStatus: a.status,
            _period: charge?.periodStart ?? '',
          };
        })
        .filter((a) => periodFilter(a._period));
      const statement = buildLandlordStatement(
        query.propertyId ?? null,
        allocations.map((a) => ({
          id: a.id,
          paymentId: '',
          chargePeriodStart: a.chargePeriodStart,
          propertyId: query.propertyId ?? null,
          propertyTitle: null,
          amountCents: a.amountCents,
          payoutStatus: a.payoutStatus,
        })),
      );
      return landlordStatementSchema.parse(statement);
    },
  );

  app.get(
    '/portal/landlord/contracts',
    { onRequest: [requirePortalKind('LANDLORD')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const leaseRows = await db
        .select()
        .from(leases)
        .where(and(eq(leases.orgId, portal.orgId), eq(leases.landlordPartyId, portal.partyId)));
      const contractIds = leaseRows.map((l) => l.contractId).filter(Boolean);
      if (contractIds.length === 0) {
        return { contracts: [] };
      }
      const rows = await db
        .select()
        .from(contracts)
        .where(
          and(eq(contracts.orgId, portal.orgId), inArray(contracts.id, contractIds as string[])),
        )
        .orderBy(desc(contracts.createdAt));
      return { contracts: rows.map((row) => toPortalContract(row, null)) };
    },
  );

  app.get(
    '/portal/landlord/inspections',
    { onRequest: [requirePortalKind('LANDLORD')] },
    async (request) => {
      const portal = requirePortalAuth(request);
      const ownerRows = await db
        .select({ propertyId: propertyOwners.propertyId })
        .from(propertyOwners)
        .where(
          and(eq(propertyOwners.orgId, portal.orgId), eq(propertyOwners.partyId, portal.partyId)),
        );
      const propertyIds = ownerRows.map((o) => o.propertyId);
      if (propertyIds.length === 0) {
        return { inspections: [] };
      }
      const rows = await db
        .select()
        .from(inspections)
        .where(
          and(eq(inspections.orgId, portal.orgId), inArray(inspections.propertyId, propertyIds)),
        )
        .orderBy(desc(inspections.createdAt));
      return { inspections: await Promise.all(rows.map((row) => toPortalInspection(db, row))) };
    },
  );

  return Promise.resolve();
};

function toPaymentDto(row: typeof payments.$inferSelect): unknown {
  return {
    id: row.id,
    orgId: row.orgId,
    chargeId: row.chargeId,
    amountCents: row.amountCents,
    method: row.method,
    status: row.status,
    providerPaymentId: row.providerPaymentId,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPortalContract(
  row: typeof contracts.$inferSelect,
  envelopeStatus: string | null,
): unknown {
  return portalContractSchema.parse({
    id: row.id,
    status: row.status,
    contentHash: row.contentHash,
    signedAt: row.signedAt?.toISOString() ?? null,
    envelopeStatus,
    // PII: content só para contrato SIGNED (ADR-033/SECURITY.md).
    content: row.status === 'SIGNED' ? row.content : null,
  });
}

async function toPortalInspection(
  db: AppDb,
  row: typeof inspections.$inferSelect,
): Promise<unknown> {
  // Snapshot estruturado SEM mídia bruta (ADR-033); observações apenas CONFIRMED.
  const [rooms, media, observations] = await Promise.all([
    db
      .select()
      .from(inspectionRooms)
      .where(eq(inspectionRooms.inspectionId, row.id))
      .orderBy(inspectionRooms.orderIndex),
    db.select().from(inspectionMedia).where(eq(inspectionMedia.inspectionId, row.id)),
    db
      .select()
      .from(inspectionObservations)
      .where(
        and(
          eq(inspectionObservations.inspectionId, row.id),
          eq(inspectionObservations.status, 'CONFIRMED'),
        ),
      ),
  ]);
  const mediaCounts = { photos: 0, audios: 0, videos: 0 };
  for (const item of media) {
    if (item.kind === 'PHOTO') {
      mediaCounts.photos += 1;
    } else if (item.kind === 'AUDIO') {
      mediaCounts.audios += 1;
    } else {
      mediaCounts.videos += 1;
    }
  }
  return portalInspectionReportSchema.parse({
    id: row.id,
    type: row.type,
    status: row.status,
    propertyId: row.propertyId,
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, orderIndex: r.orderIndex })),
    observations: observations.map((o) => ({
      id: o.id,
      room: o.roomId ?? null,
      category: o.category,
      severity: o.severity,
      status: o.status,
      text: o.description,
    })),
    mediaCounts,
    inspectedAt: row.updatedAt.toISOString(),
  });
}

export { toPortalInspection };
