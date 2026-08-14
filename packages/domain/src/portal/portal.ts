/**
 * Regras puras do portal externo (proprietário/locatário) e reporting.
 * Nenhuma função aqui calcula dinheiro novo — extratos usam valores persistidos
 * (charges/payments/split/payouts) e reporting agrega dados já gravados.
 */

// ---------- Extrato do locatário ----------

export interface StatementChargeRow {
  id: string;
  periodStart: string;
  dueDate: string;
  status: string;
  amountCents: number;
  lateFeeCents: number;
  interestCents: number;
  paidAt: string | null;
}

export interface StatementPaymentRow {
  id: string;
  chargeId: string;
  amountCents: number;
  method: string;
  status: string;
  paidAt: string | null;
}

export interface TenantStatement {
  charges: StatementChargeRow[];
  payments: StatementPaymentRow[];
  totals: {
    billedCents: number;
    paidCents: number;
    openCents: number;
  };
}

export function buildTenantStatement(
  charges: StatementChargeRow[],
  payments: StatementPaymentRow[],
): TenantStatement {
  const billedCents = charges.reduce((sum, c) => sum + c.amountCents, 0);
  const paidCents = charges
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + c.amountCents, 0);
  const openCents = charges
    .filter((c) => c.status === 'OPEN' || c.status === 'OVERDUE' || c.status === 'SCHEDULED')
    .reduce((sum, c) => sum + c.amountCents, 0);
  return { charges, payments, totals: { billedCents, paidCents, openCents } };
}

// ---------- Extrato do proprietário ----------

export interface LandlordAllocationRow {
  id: string;
  paymentId: string;
  chargePeriodStart: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  amountCents: number;
  payoutStatus: string | null;
}

export interface LandlordStatement {
  propertyId: string | null;
  allocations: LandlordAllocationRow[];
  totals: {
    allocatedCents: number;
    paidOutCents: number;
    pendingCents: number;
  };
}

export function buildLandlordStatement(
  propertyId: string | null,
  allocations: LandlordAllocationRow[],
): LandlordStatement {
  const allocatedCents = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  const paidOutCents = allocations
    .filter((a) => a.payoutStatus === 'PAID')
    .reduce((sum, a) => sum + a.amountCents, 0);
  const pendingCents = allocations
    .filter((a) => a.payoutStatus === 'PENDING' || a.payoutStatus === null)
    .reduce((sum, a) => sum + a.amountCents, 0);
  return { propertyId, allocations, totals: { allocatedCents, paidOutCents, pendingCents } };
}

// ---------- Visibilidade de vistoria ----------

export type PortalKind = 'LANDLORD' | 'TENANT';
export type InspectionType = string;

/** Portal vê apenas vistorias de entrada/saída da própria locação; nunca mídia bruta (ADR-033). */
export function canPortalReadInspection(portalKind: string, inspectionType: string): boolean {
  if (portalKind !== 'LANDLORD' && portalKind !== 'TENANT') {
    return false;
  }
  // Vistorias intermediárias (INTERMEDIATE) ficam fora do portal.
  return inspectionType === 'CHECKIN' || inspectionType === 'CHECKOUT';
}

// ---------- Exportação segura (whitelist por papel) ----------

const EXPORT_COLUMNS: Record<string, readonly string[]> = {
  leads: ['id', 'status', 'channel', 'source', 'createdAt'],
  charges: ['id', 'leaseId', 'periodStart', 'dueDate', 'status', 'amountCents', 'paidAt'],
  payments: ['id', 'chargeId', 'amountCents', 'method', 'status', 'paidAt'],
  payouts: ['id', 'partyId', 'amountCents', 'status', 'createdAt'],
  inspections: ['id', 'propertyId', 'type', 'status', 'inspectedAt'],
  contracts: ['id', 'status', 'signedAt', 'templateId'],
  meta_campaigns: ['id', 'name', 'objective', 'status', 'providerCampaignId'],
};

/** Filtra linhas para exportação mantendo apenas colunas permitidas por papel. */
export function sanitizeExportColumns(
  role: string,
  kind: string,
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const allowed = EXPORT_COLUMNS[kind];
  if (!allowed) {
    throw new Error(`Tipo de exportação não suportado: ${kind}`);
  }
  // Roles de leitura ampla (owner/admin/finance) mantêm a whitelist; demais roles
  // não exportam (checado antes de chamar esta função via requirePermission).
  if (!['owner', 'admin', 'finance'].includes(role)) {
    return [];
  }
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const column of allowed) {
      if (column in row) {
        out[column] = row[column];
      }
    }
    return out;
  });
}

// ---------- Agregadores de reporting (puros) ----------

export interface FunnelPoint {
  period: string;
  status: string;
  count: number;
}

export interface FunnelRow {
  status: string;
  createdAt: string;
}

export function aggregateFunnelByPeriod(rows: FunnelRow[], periodDays: number): FunnelPoint[] {
  const byPeriod = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const day = row.createdAt.slice(0, 10);
    const period = periodFor(day, periodDays);
    const map = byPeriod.get(period) ?? new Map<string, number>();
    map.set(row.status, (map.get(row.status) ?? 0) + 1);
    byPeriod.set(period, map);
  }
  const out: FunnelPoint[] = [];
  for (const [period, statuses] of byPeriod) {
    for (const [status, count] of statuses) {
      out.push({ period, status, count });
    }
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

export interface RevenueRow {
  month: string;
  amountCents: number;
}

export function aggregateRevenueByMonth(rows: RevenueRow[]): RevenueRow[] {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const month = row.month.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + row.amountCents);
  }
  return [...byMonth.entries()]
    .map(([month, amountCents]) => ({ month, amountCents }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface MetaSpendRow {
  campaignId: string;
  dateStart: string;
  dateEnd: string;
  spendCents: number;
}

export function aggregateMetaSpend(rows: MetaSpendRow[]): {
  totalSpendCents: number;
  byCampaign: Array<{ campaignId: string; spendCents: number }>;
} {
  const byCampaign = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    total += row.spendCents;
    byCampaign.set(row.campaignId, (byCampaign.get(row.campaignId) ?? 0) + row.spendCents);
  }
  return {
    totalSpendCents: total,
    byCampaign: [...byCampaign.entries()].map(([campaignId, spendCents]) => ({
      campaignId,
      spendCents,
    })),
  };
}

/** Agrupa por janela de N dias a partir do dia informado (ex.: 7 → semana, 30 → mês). */
function periodFor(day: string, periodDays: number): string {
  if (periodDays <= 1) {
    return day;
  }
  const date = new Date(`${day}T00:00:00.000Z`);
  if (periodDays >= 30) {
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    return `${String(year)}-${String(month).padStart(2, '0')}`;
  }
  // semana: usa a ISO week (segunda-feira)
  const monday = new Date(date);
  const dow = (date.getUTCDay() + 6) % 7;
  monday.setUTCDate(date.getUTCDate() - dow);
  return monday.toISOString().slice(0, 10);
}
