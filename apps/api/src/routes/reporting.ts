import type { FastifyPluginAsync } from 'fastify';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  charges,
  contracts,
  inspections,
  leads,
  ledgerAccounts,
  ledgerEntries,
  metaCampaignLinks,
  metaInsightSnapshots,
  payments,
  payouts,
} from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  aggregateFunnelByPeriod,
  aggregateMetaSpend,
  aggregateRevenueByMonth,
  sanitizeExportColumns,
} from '@aluguei/domain';
import {
  exportQuerySchema,
  funnelReportQuerySchema,
  funnelReportResponseSchema,
  metaSpendQuerySchema,
  metaSpendResponseSchema,
  revenueMonthlyQuerySchema,
  revenueMonthlyResponseSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';

function dateFilter(
  column: { gte: unknown; lte: unknown },
  from?: string,
  to?: string,
): ReturnType<typeof and> | undefined {
  const conds: ReturnType<typeof and>[] = [];
  if (from) {
    conds.push(gte(column.gte as never, new Date(`${from}T00:00:00.000Z`)) as never);
  }
  if (to) {
    conds.push(lte(column.lte as never, new Date(`${to}T23:59:59.999Z`)) as never);
  }
  return conds.length > 0 ? and(...(conds as never[])) : undefined;
}

/** Consulta de listagem paginada por tabela (usada nas exportações). */
async function fetchRowsForExport(
  db: AppDb,
  orgId: string,
  kind: string,
  from?: string,
  to?: string,
  maxRows = 1_000,
): Promise<Array<Record<string, unknown>>> {
  switch (kind) {
    case 'leads': {
      const rows = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.orgId, orgId),
            dateFilter({ gte: leads.createdAt, lte: leads.createdAt }, from, to) as never,
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(maxRows);
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        channel: r.channel,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
      }));
    }
    case 'charges': {
      const rows = await db
        .select()
        .from(charges)
        .where(
          and(
            eq(charges.orgId, orgId),
            dateFilter({ gte: charges.createdAt, lte: charges.createdAt }, from, to) as never,
          ),
        )
        .orderBy(desc(charges.createdAt))
        .limit(maxRows);
      return rows.map((r) => ({
        id: r.id,
        leaseId: r.leaseId,
        periodStart: r.periodStart,
        dueDate: r.dueDate,
        status: r.status,
        amountCents: r.amountCents,
        paidAt: r.paidAt?.toISOString() ?? null,
      }));
    }
    case 'payments': {
      const rows = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.orgId, orgId),
            dateFilter({ gte: payments.createdAt, lte: payments.createdAt }, from, to) as never,
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(maxRows);
      return rows.map((r) => ({
        id: r.id,
        chargeId: r.chargeId,
        amountCents: r.amountCents,
        method: r.method,
        status: r.status,
        paidAt: r.paidAt?.toISOString() ?? null,
      }));
    }
    case 'payouts': {
      const rows = await db
        .select()
        .from(payouts)
        .where(
          and(
            eq(payouts.orgId, orgId),
            dateFilter({ gte: payouts.createdAt, lte: payouts.createdAt }, from, to) as never,
          ),
        )
        .orderBy(desc(payouts.createdAt))
        .limit(maxRows);
      return rows.map((r) => ({
        id: r.id,
        partyId: r.partyId,
        amountCents: r.amountCents,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));
    }
    case 'inspections': {
      const rows = await db
        .select()
        .from(inspections)
        .where(
          and(
            eq(inspections.orgId, orgId),
            dateFilter(
              { gte: inspections.createdAt, lte: inspections.createdAt },
              from,
              to,
            ) as never,
          ),
        )
        .orderBy(desc(inspections.createdAt))
        .limit(maxRows);
      return rows.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        type: r.type,
        status: r.status,
        inspectedAt: r.updatedAt.toISOString(),
      }));
    }
    case 'contracts': {
      const rows = await db
        .select()
        .from(contracts)
        .where(
          and(
            eq(contracts.orgId, orgId),
            dateFilter({ gte: contracts.createdAt, lte: contracts.createdAt }, from, to) as never,
          ),
        )
        .orderBy(desc(contracts.createdAt))
        .limit(maxRows);
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        signedAt: r.signedAt?.toISOString() ?? null,
        templateId: r.templateId,
      }));
    }
    case 'meta_campaigns': {
      const rows = await db
        .select()
        .from(metaCampaignLinks)
        .where(eq(metaCampaignLinks.orgId, orgId))
        .orderBy(desc(metaCampaignLinks.createdAt))
        .limit(maxRows);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        objective: r.objective,
        status: r.status,
        providerCampaignId: r.providerCampaignId,
      }));
    }
    default:
      return [];
  }
}

export const reportingRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get(
    '/reporting/leads-funnel',
    { onRequest: [requirePermission('report:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = funnelReportQuerySchema.parse(request.query);
      const conditions = [eq(leads.orgId, auth.orgId)];
      if (query.from) {
        conditions.push(gte(leads.createdAt, new Date(`${query.from}T00:00:00.000Z`)) as never);
      }
      if (query.to) {
        conditions.push(lte(leads.createdAt, new Date(`${query.to}T23:59:59.999Z`)) as never);
      }
      const rows = await db
        .select({ status: leads.status, createdAt: leads.createdAt })
        .from(leads)
        .where(and(...(conditions as never[])))
        .orderBy(asc(leads.createdAt));
      const points = aggregateFunnelByPeriod(
        rows.map((r) => ({ status: r.status, createdAt: r.createdAt.toISOString() })),
        query.periodDays,
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.REPORT_VIEWED,
        entityType: 'REPORT',
        entityId: 'leads-funnel',
      });
      return funnelReportResponseSchema.parse({ points });
    },
  );

  app.get(
    '/reporting/revenue-monthly',
    { onRequest: [requirePermission('report:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = revenueMonthlyQuerySchema.parse(request.query);
      const [revenueAccount] = await db
        .select({ id: ledgerAccounts.id })
        .from(ledgerAccounts)
        .where(
          and(eq(ledgerAccounts.orgId, auth.orgId), eq(ledgerAccounts.code, 'AGENCY_FEE_REVENUE')),
        )
        .limit(1);
      if (!revenueAccount) {
        return revenueMonthlyResponseSchema.parse({ months: [] });
      }
      const conditions = [
        eq(ledgerEntries.orgId, auth.orgId),
        eq(ledgerEntries.accountId, revenueAccount.id),
      ] as never[];
      if (query.from) {
        conditions.push(
          gte(ledgerEntries.createdAt, new Date(`${query.from}T00:00:00.000Z`)) as never,
        );
      }
      if (query.to) {
        conditions.push(
          lte(ledgerEntries.createdAt, new Date(`${query.to}T23:59:59.999Z`)) as never,
        );
      }
      const rows = await db
        .select({ amountCents: ledgerEntries.amountCents, createdAt: ledgerEntries.createdAt })
        .from(ledgerEntries)
        .where(and(...conditions));
      const months = aggregateRevenueByMonth(
        rows.map((r) => ({
          month: r.createdAt.toISOString(),
          amountCents: Math.abs(r.amountCents),
        })),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.REPORT_VIEWED,
        entityType: 'REPORT',
        entityId: 'revenue-monthly',
      });
      return revenueMonthlyResponseSchema.parse({ months });
    },
  );

  app.get(
    '/reporting/meta-spend',
    { onRequest: [requirePermission('report:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = metaSpendQuerySchema.parse(request.query);
      const conditions = [eq(metaInsightSnapshots.orgId, auth.orgId)] as never[];
      if (query.campaignId) {
        conditions.push(eq(metaInsightSnapshots.campaignLinkId, query.campaignId) as never);
      }
      const rows = await db
        .select()
        .from(metaInsightSnapshots)
        .where(and(...conditions))
        .orderBy(desc(metaInsightSnapshots.syncedAt));
      const spend = aggregateMetaSpend(
        rows.map((r) => ({
          campaignId: r.campaignLinkId,
          dateStart: r.dateStart,
          dateEnd: r.dateEnd,
          spendCents: (r.insights as { spendCents?: number }).spendCents ?? 0,
        })),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.REPORT_VIEWED,
        entityType: 'REPORT',
        entityId: 'meta-spend',
      });
      return metaSpendResponseSchema.parse({
        totalSpendCents: spend.totalSpendCents,
        byCampaign: spend.byCampaign.map((c) => ({
          campaignId: c.campaignId,
          spendCents: c.spendCents,
        })),
      });
    },
  );

  app.get(
    '/reporting/export/:kind',
    {
      onRequest: [requirePermission('report:export')],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const query = exportQuerySchema.parse({
        kind: (request.params as { kind: string }).kind,
        format: (request.query as { format?: string }).format,
        from: (request.query as { from?: string }).from,
        to: (request.query as { to?: string }).to,
        maxRows: (request.query as { maxRows?: number }).maxRows,
      });
      const rows = await fetchRowsForExport(
        db,
        auth.orgId,
        query.kind,
        query.from,
        query.to,
        query.maxRows,
      );
      const sanitized = sanitizeExportColumns(auth.role, query.kind, rows);
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.REPORT_EXPORTED,
        entityType: 'REPORT',
        entityId: `export:${query.kind}`,
        payload: { format: query.format, rows: sanitized.length },
      });
      if (query.format === 'csv') {
        const csv = toCsv(sanitized);
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${query.kind}.csv"`)
          .send(csv);
      }
      return { rows: sanitized, total: sanitized.length };
    },
  );

  return Promise.resolve();
};

/** Serializa linhas para CSV (escape de vírgulas/aspas). */
function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    if (typeof value === 'string') {
      const escaped = /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
      return escaped;
    }
    const primitive = value as string | number | boolean | bigint;
    return String(primitive);
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}
