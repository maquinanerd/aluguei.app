import { describe, expect, it } from 'vitest';
import {
  aggregateFunnelByPeriod,
  aggregateMetaSpend,
  aggregateRevenueByMonth,
  buildLandlordStatement,
  buildTenantStatement,
  canPortalReadInspection,
  sanitizeExportColumns,
} from '../index.js';

describe('portal/statement', () => {
  it('extrato do locatário soma por status', () => {
    const statement = buildTenantStatement(
      [
        {
          id: 'c1',
          periodStart: '2026-08-01',
          dueDate: '2026-08-10',
          status: 'PAID',
          amountCents: 100_000,
          lateFeeCents: 0,
          interestCents: 0,
          paidAt: '2026-08-05T00:00:00.000Z',
        },
        {
          id: 'c2',
          periodStart: '2026-09-01',
          dueDate: '2026-09-10',
          status: 'OPEN',
          amountCents: 100_000,
          lateFeeCents: 0,
          interestCents: 0,
          paidAt: null,
        },
      ],
      [],
    );
    expect(statement.totals.billedCents).toBe(200_000);
    expect(statement.totals.paidCents).toBe(100_000);
    expect(statement.totals.openCents).toBe(100_000);
  });

  it('extrato do proprietário separa pago/pendente', () => {
    const statement = buildLandlordStatement('p1', [
      {
        id: 'a1',
        paymentId: 'pay1',
        chargePeriodStart: '2026-08-01',
        propertyId: 'p1',
        propertyTitle: 'Casa',
        amountCents: 90_000,
        payoutStatus: 'PAID',
      },
      {
        id: 'a2',
        paymentId: 'pay2',
        chargePeriodStart: '2026-09-01',
        propertyId: 'p1',
        propertyTitle: 'Casa',
        amountCents: 90_000,
        payoutStatus: 'PENDING',
      },
    ]);
    expect(statement.totals.allocatedCents).toBe(180_000);
    expect(statement.totals.paidOutCents).toBe(90_000);
    expect(statement.totals.pendingCents).toBe(90_000);
  });
});

describe('portal/inspection visibility', () => {
  it('locatário e proprietário veem vistorias da própria locação (relatório, nunca mídia)', () => {
    expect(canPortalReadInspection('TENANT', 'CHECKIN')).toBe(true);
    expect(canPortalReadInspection('TENANT', 'CHECKOUT')).toBe(true);
    expect(canPortalReadInspection('LANDLORD', 'CHECKIN')).toBe(true);
    expect(canPortalReadInspection('LANDLORD', 'CHECKOUT')).toBe(true);
  });
});

describe('portal/export sanitize', () => {
  it('mantém apenas colunas da whitelist por tipo', () => {
    const rows = [
      {
        id: 'l1',
        status: 'WON',
        channel: 'whatsapp',
        source: 'bot',
        createdAt: '2026-08-01',
        email: 'segredo@example.com',
        phone: '11999999999',
      },
    ];
    const out = sanitizeExportColumns('finance', 'leads', rows);
    expect(out[0]).toEqual({
      id: 'l1',
      status: 'WON',
      channel: 'whatsapp',
      source: 'bot',
      createdAt: '2026-08-01',
    });
    expect(out[0]).not.toHaveProperty('email');
    expect(out[0]).not.toHaveProperty('phone');
  });

  it('role sem permissão não exporta nada', () => {
    expect(sanitizeExportColumns('viewer', 'leads', [{ id: 'x' }])).toEqual([]);
  });

  it('tipo desconhecido lança', () => {
    expect(() => sanitizeExportColumns('owner', 'nope', [])).toThrow('não suportado');
  });
});

describe('portal/reporting', () => {
  it('funil agrega por período/status', () => {
    const points = aggregateFunnelByPeriod(
      [
        { status: 'NEW', createdAt: '2026-08-01T10:00:00.000Z' },
        { status: 'NEW', createdAt: '2026-08-01T11:00:00.000Z' },
        { status: 'WON', createdAt: '2026-08-01T12:00:00.000Z' },
        { status: 'WON', createdAt: '2026-08-15T12:00:00.000Z' },
      ],
      1,
    );
    expect(points).toContainEqual({ period: '2026-08-01', status: 'NEW', count: 2 });
    expect(points).toContainEqual({ period: '2026-08-01', status: 'WON', count: 1 });
    expect(points).toContainEqual({ period: '2026-08-15', status: 'WON', count: 1 });
  });

  it('receita mensal soma por mês', () => {
    const rows = aggregateRevenueByMonth([
      { month: '2026-08-01', amountCents: 10_000 },
      { month: '2026-08-15', amountCents: 5_000 },
      { month: '2026-09-01', amountCents: 7_000 },
    ]);
    expect(rows).toContainEqual({ month: '2026-08', amountCents: 15_000 });
    expect(rows).toContainEqual({ month: '2026-09', amountCents: 7_000 });
  });

  it('spend Meta soma por campanha', () => {
    const agg = aggregateMetaSpend([
      { campaignId: 'c1', dateStart: '2026-08-01', dateEnd: '2026-08-14', spendCents: 1_000 },
      { campaignId: 'c1', dateStart: '2026-08-15', dateEnd: '2026-08-31', spendCents: 2_000 },
      { campaignId: 'c2', dateStart: '2026-08-01', dateEnd: '2026-08-31', spendCents: 500 },
    ]);
    expect(agg.totalSpendCents).toBe(3_500);
    expect(agg.byCampaign).toContainEqual({ campaignId: 'c1', spendCents: 3_000 });
    expect(agg.byCampaign).toContainEqual({ campaignId: 'c2', spendCents: 500 });
  });
});
