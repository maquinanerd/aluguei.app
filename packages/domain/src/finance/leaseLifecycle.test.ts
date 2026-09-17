import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  assertOwnershipTotal,
  assertReadjustmentWithinLease,
  assertRenewal,
  assertRentChangeAfterHistory,
  BILLABLE_LEASE_STATUSES,
  landlordSharesFromOwners,
  planLeaseEnd,
  readjustedRent,
  rentForPeriod,
  shouldBillPeriod,
  shouldFinalizeLeaseEnd,
} from './leaseLifecycle.js';
import { splitAmong } from './split.js';

/**
 * Ciclo de vida da locação e repasse por coproprietário (auditoria 2026-09-10, P1-08 e P1-20).
 * Antes: o scheduler cobrava locações ENDED e PENDING (comparação alfabética de status), não
 * havia renovação, reajuste nem encerramento, e 100% do repasse ia para um único proprietário.
 */
describe('scheduler: quais locações são cobradas em cada período', () => {
  const lease = { status: 'ACTIVE', startDate: '2026-09-15', endDate: null };

  it('lista explícita de status cobráveis', () => {
    expect([...BILLABLE_LEASE_STATUSES]).toEqual(['ACTIVE', 'DELINQUENT', 'TERMINATING']);
  });

  it('ativa ou inadimplente é cobrada a partir do mês de início', () => {
    expect(shouldBillPeriod(lease, '2026-09-01')).toBe(true);
    expect(shouldBillPeriod(lease, '2026-10-01')).toBe(true);
    expect(shouldBillPeriod(lease, '2026-08-01')).toBe(false);
    expect(shouldBillPeriod({ ...lease, status: 'DELINQUENT' }, '2026-10-01')).toBe(true);
  });

  it('encerrada e pendente nunca são cobradas', () => {
    expect(shouldBillPeriod({ ...lease, status: 'ENDED' }, '2026-10-01')).toBe(false);
    expect(shouldBillPeriod({ ...lease, status: 'PENDING' }, '2026-10-01')).toBe(false);
  });

  it('em encerramento é cobrada até o mês do fim', () => {
    const ending = { status: 'TERMINATING', startDate: '2026-01-10', endDate: '2026-11-20' };
    expect(shouldBillPeriod(ending, '2026-11-01')).toBe(true);
    expect(shouldBillPeriod(ending, '2026-12-01')).toBe(false);
  });
});

describe('encerramento da locação', () => {
  it('fim no passado: passa por TERMINATING e chega a ENDED', () => {
    expect(planLeaseEnd({ status: 'ACTIVE', endDate: '2026-10-31', today: '2026-11-02' })).toEqual([
      'TERMINATING',
      'ENDED',
    ]);
  });

  it('fim no futuro: fica TERMINATING até a data', () => {
    expect(planLeaseEnd({ status: 'ACTIVE', endDate: '2026-12-31', today: '2026-11-02' })).toEqual([
      'TERMINATING',
    ]);
    expect(
      shouldFinalizeLeaseEnd({ status: 'TERMINATING', endDate: '2026-12-31' }, '2026-12-31'),
    ).toBe(false);
    expect(
      shouldFinalizeLeaseEnd({ status: 'TERMINATING', endDate: '2026-12-31' }, '2027-01-01'),
    ).toBe(true);
  });

  it('locação já encerrada não é encerrada de novo', () => {
    expect(() =>
      planLeaseEnd({ status: 'ENDED', endDate: '2026-12-31', today: '2026-11-02' }),
    ).toThrow(DomainError);
  });
});

describe('renovação e reajuste', () => {
  it('renovar exige locação ativa e nova data depois do fim atual', () => {
    expect(() => {
      assertRenewal({
        status: 'ACTIVE',
        startDate: '2025-11-01',
        endDate: '2026-10-31',
        newEndDate: '2027-10-31',
      });
    }).not.toThrow();
    expect(() => {
      assertRenewal({
        status: 'ACTIVE',
        startDate: '2025-11-01',
        endDate: '2026-10-31',
        newEndDate: '2026-10-31',
      });
    }).toThrow(DomainError);
    expect(() => {
      assertRenewal({
        status: 'ENDED',
        startDate: '2025-11-01',
        endDate: '2026-10-31',
        newEndDate: '2027-10-31',
      });
    }).toThrow(DomainError);
    expect(() => {
      assertRenewal({
        status: 'ACTIVE',
        startDate: '2025-11-01',
        endDate: null,
        newEndDate: '2025-10-01',
      });
    }).toThrow(DomainError);
  });

  it('reajuste por índice arredonda ao centavo e aceita índice negativo', () => {
    expect(readjustedRent(100_000, 452)).toBe(104_520);
    expect(readjustedRent(100_000, -125)).toBe(98_750);
    expect(readjustedRent(99_999, 333)).toBe(103_329);
    expect(() => readjustedRent(100_000, -10_000)).toThrow(DomainError);
  });

  it('aluguel de cada período segue o histórico de mudanças', () => {
    const changes = [
      { effectiveFrom: '2026-11-01', previousRentCents: 100_000, newRentCents: 110_000 },
      { effectiveFrom: '2027-11-01', previousRentCents: 110_000, newRentCents: 115_000 },
    ];
    expect(rentForPeriod(115_000, changes, '2026-10-01')).toBe(100_000);
    expect(rentForPeriod(115_000, changes, '2026-11-01')).toBe(110_000);
    expect(rentForPeriod(115_000, changes, '2027-06-01')).toBe(110_000);
    expect(rentForPeriod(115_000, changes, '2027-12-01')).toBe(115_000);
    expect(rentForPeriod(90_000, [], '2027-12-01')).toBe(90_000);
  });

  it('mudança de aluguel nova não começa antes da última registrada; no mesmo mês vale a mais recente', () => {
    const changes = [
      { effectiveFrom: '2027-03-01', previousRentCents: 100_000, newRentCents: 105_000 },
    ];
    expect(() => {
      assertRentChangeAfterHistory(changes, '2027-02-01');
    }).toThrow(DomainError);
    expect(() => {
      assertRentChangeAfterHistory(changes, '2027-03-01');
    }).not.toThrow();
    expect(() => {
      assertRentChangeAfterHistory([], '2020-01-01');
    }).not.toThrow();
    const corrected = [
      ...changes,
      { effectiveFrom: '2027-03-01', previousRentCents: 105_000, newRentCents: 104_000 },
    ];
    expect(rentForPeriod(104_000, corrected, '2027-04-01')).toBe(104_000);
    expect(rentForPeriod(104_000, corrected, '2027-02-01')).toBe(100_000);
  });

  it('reajuste começa num mês da vigência', () => {
    const lease = { startDate: '2026-09-17', endDate: '2027-01-31' };
    for (const effectiveFrom of ['2026-09-01', '2026-12-01', '2027-01-01']) {
      expect(() => {
        assertReadjustmentWithinLease({ ...lease, effectiveFrom });
      }).not.toThrow();
    }
    for (const effectiveFrom of ['2026-08-01', '2027-02-01']) {
      expect(() => {
        assertReadjustmentWithinLease({ ...lease, effectiveFrom });
      }).toThrow(DomainError);
    }
    expect(() => {
      assertReadjustmentWithinLease({ ...lease, endDate: null, effectiveFrom: '2040-01-01' });
    }).not.toThrow();
  });
});

describe('repasse por coproprietário', () => {
  it('sem proprietário, a locação não tem repasse', () => {
    expect(landlordSharesFromOwners([])).toEqual([]);
  });

  it('proprietário único recebe 100%, com ou sem participação registrada', () => {
    expect(landlordSharesFromOwners([{ partyId: 'p1', ownershipSharePct: null }])).toEqual([
      { partyId: 'p1', shareBps: 10_000 },
    ]);
    expect(landlordSharesFromOwners([{ partyId: 'p1', ownershipSharePct: 100 }])).toEqual([
      { partyId: 'p1', shareBps: 10_000 },
    ]);
  });

  it('coproprietários: participações registradas somando 100%', () => {
    expect(
      landlordSharesFromOwners([
        { partyId: 'p1', ownershipSharePct: 60 },
        { partyId: 'p2', ownershipSharePct: 40 },
      ]),
    ).toEqual([
      { partyId: 'p1', shareBps: 6_000 },
      { partyId: 'p2', shareBps: 4_000 },
    ]);
  });

  it('participação faltando ou soma diferente de 100% impede a locação', () => {
    for (const owners of [
      [{ partyId: 'p1', ownershipSharePct: 50 }],
      [
        { partyId: 'p1', ownershipSharePct: 60 },
        { partyId: 'p2', ownershipSharePct: null },
      ],
      [
        { partyId: 'p1', ownershipSharePct: 70 },
        { partyId: 'p2', ownershipSharePct: 40 },
      ],
    ]) {
      expect(() => landlordSharesFromOwners(owners)).toThrow(DomainError);
    }
  });

  it('cadastro do imóvel: a soma das participações não passa de 100%', () => {
    expect(() => {
      assertOwnershipTotal([60, 40]);
    }).not.toThrow();
    expect(() => {
      assertOwnershipTotal([60, null]);
    }).not.toThrow();
    expect(() => {
      assertOwnershipTotal([70, 40]);
    }).toThrow(DomainError);
  });

  it('o repasse de 90.001 centavos entre 60% e 40% não perde centavo', () => {
    expect(splitAmong(90_001, [6_000, 4_000])).toEqual([54_001, 36_000]);
  });
});
