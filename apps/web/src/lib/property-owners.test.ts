import { describe, expect, it } from 'vitest';
import { assertOwnershipTotal, landlordSharesFromOwners } from '@aluguei/domain';
import { ownershipCheck, ownershipExceedsTotal, parseOwnerSharePct } from './property-owners';

/**
 * G3, trilha C (auditoria 2026-09-10, P1-08): o repasse vai para cada coproprietário conforme a
 * participação cadastrada no imóvel, e a locação só nasce com as participações somando 100%. A tela
 * do imóvel precisa cadastrar a participação e avisar antes que a locação seja recusada.
 */
describe('participação do proprietário', () => {
  it('percentual inteiro de 1 a 100; vazio fica sem participação', () => {
    expect(parseOwnerSharePct('60')).toEqual({ ok: true, pct: 60 });
    expect(parseOwnerSharePct(' 100 ')).toEqual({ ok: true, pct: 100 });
    expect(parseOwnerSharePct('')).toEqual({ ok: true, pct: null });
    for (const text of ['0', '101', '33,3', 'abc', '-5']) {
      expect(parseOwnerSharePct(text), text).toEqual({
        ok: false,
        error: 'Informe a participação em número inteiro, de 1% a 100%.',
      });
    }
  });

  it('soma acima de 100% igual à recusa do domínio', () => {
    const cases: Array<[Array<number | null>, number | null]> = [
      [[60], 40],
      [[60], 50],
      [[60, null], 40],
      [[], 100],
      [[100], null],
      [[100], 1],
    ];
    for (const [registered, pct] of cases) {
      const owners = registered.map((ownershipSharePct, index) => ({
        partyId: `p${String(index)}`,
        ownershipSharePct,
      }));
      const domainRefuses = (() => {
        try {
          assertOwnershipTotal([...registered, pct]);
          return false;
        } catch {
          return true;
        }
      })();
      expect(ownershipExceedsTotal(owners, pct), JSON.stringify([registered, pct])).toBe(
        domainRefuses
          ? `As participações somariam ${String(registered.reduce<number>((s, p) => s + (p ?? 0), 0) + (pct ?? 0))}%, acima de 100%.`
          : null,
      );
    }
  });

  it('pronto para locação igual ao domínio, com o motivo quando não está', () => {
    const cases: Array<Array<number | null>> = [
      [],
      [null],
      [100],
      [60],
      [60, 40],
      [60, 30],
      [60, null],
      [50, 30, 20],
    ];
    for (const shares of cases) {
      const owners = shares.map((ownershipSharePct, index) => ({
        partyId: `p${String(index)}`,
        ownershipSharePct,
      }));
      const domainAccepts = (() => {
        try {
          landlordSharesFromOwners(owners);
          return true;
        } catch {
          return false;
        }
      })();
      expect(ownershipCheck(owners).readyForLease, JSON.stringify(shares)).toBe(domainAccepts);
    }

    expect(ownershipCheck([])).toEqual({
      totalPct: 0,
      readyForLease: true,
      message: 'Sem proprietário vinculado, a locação deste imóvel fica sem repasse.',
    });
    expect(ownershipCheck([{ partyId: 'a', ownershipSharePct: null }])).toEqual({
      totalPct: 100,
      readyForLease: true,
      message: null,
    });
    expect(
      ownershipCheck([
        { partyId: 'a', ownershipSharePct: 60 },
        { partyId: 'b', ownershipSharePct: 30 },
      ]),
    ).toEqual({
      totalPct: 90,
      readyForLease: false,
      message: 'As participações somam 90%; para criar a locação, precisam somar 100%.',
    });
    expect(
      ownershipCheck([
        { partyId: 'a', ownershipSharePct: 60 },
        { partyId: 'b', ownershipSharePct: null },
      ]),
    ).toEqual({
      totalPct: 60,
      readyForLease: false,
      message: 'Registre a participação de cada proprietário para criar a locação.',
    });
  });
});
