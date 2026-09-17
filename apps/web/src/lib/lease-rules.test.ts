import { describe, expect, it } from 'vitest';
import {
  DomainError,
  LEASE_STATUSES,
  MAX_INTEREST_MONTHLY_BPS,
  MAX_LATE_FEE_BPS,
  assertReadjustmentWithinLease,
  assertRenewal,
  planLeaseEnd,
  readjustedRent,
  rentForPeriod,
} from '@aluguei/domain';
import {
  describeAmendment,
  endOutcome,
  formatBps,
  leaseActions,
  parseLeaseEnd,
  parseLeaseTerms,
  parsePercentBps,
  parseReadjustment,
  parseRenewal,
  readjustedRentPreview,
  renewalRentStartsAt,
  rentChangesOf,
  rentForPeriodPreview,
  unpaidChargesAfterEnd,
} from './lease-rules';

/**
 * G3, trilha C (auditoria 2026-09-10, P1-07 e P1-20): encargos, renovação, reajuste e encerramento
 * pela interface. As regras espelham o domínio sem importá-lo no bundle do cliente; aqui cada uma
 * é comparada com a do domínio.
 */
describe('percentual em basis points', () => {
  it('lê vírgula ou ponto decimal, sinal e símbolo de porcentagem', () => {
    expect(parsePercentBps('2')).toBe(200);
    expect(parsePercentBps('2,5')).toBe(250);
    expect(parsePercentBps(' 4.52 % ')).toBe(452);
    expect(parsePercentBps('-1,25')).toBe(-125);
    expect(parsePercentBps('+0,5')).toBe(50);
  });

  it('recusa texto, vazio e mais de duas casas', () => {
    for (const text of ['', 'abc', '1,234', '1.2.3', '2,', ',5', '--1']) {
      expect(parsePercentBps(text), text).toBeNull();
    }
  });

  it('formata sem zeros à direita', () => {
    expect(formatBps(200)).toBe('2%');
    expect(formatBps(250)).toBe('2,5%');
    expect(formatBps(452)).toBe('4,52%');
    expect(formatBps(-125)).toBe('-1,25%');
    expect(formatBps(0)).toBe('0%');
  });
});

describe('encargos da locação', () => {
  it('converte para basis points dentro dos limites do domínio', () => {
    expect(parseLeaseTerms({ lateFee: '2,5', interest: '0,5', dueDay: '5' })).toEqual({
      ok: true,
      value: { lateFeeBps: 250, interestMonthlyBps: 50, dueDay: 5 },
    });
    expect(
      parseLeaseTerms({
        lateFee: String(MAX_LATE_FEE_BPS / 100),
        interest: String(MAX_INTEREST_MONTHLY_BPS / 100),
        dueDay: '28',
      }),
    ).toEqual({ ok: true, value: { lateFeeBps: 1_000, interestMonthlyBps: 100, dueDay: 28 } });
  });

  it('acusa cada campo fora do limite', () => {
    expect(parseLeaseTerms({ lateFee: '10,01', interest: '1,5', dueDay: '29' })).toEqual({
      ok: false,
      errors: {
        lateFee: 'A multa fica entre 0% e 10%.',
        interest: 'Os juros de mora ficam entre 0% e 1% ao mês.',
        dueDay: 'O vencimento fica entre os dias 1 e 28.',
      },
    });
    // Negativo, texto e dia fracionado: as mesmas mensagens.
    expect(parseLeaseTerms({ lateFee: '-1', interest: 'x', dueDay: '2,5' })).toEqual({
      ok: false,
      errors: {
        lateFee: 'A multa fica entre 0% e 10%.',
        interest: 'Os juros de mora ficam entre 0% e 1% ao mês.',
        dueDay: 'O vencimento fica entre os dias 1 e 28.',
      },
    });
  });
});

describe('ações da locação em cada status', () => {
  const throwsDomain = (fn: () => unknown): boolean => {
    try {
      fn();
      return false;
    } catch (err) {
      if (err instanceof DomainError) return true;
      throw err;
    }
  };

  it('renovar e encerrar seguem o domínio', () => {
    for (const status of LEASE_STATUSES) {
      const actions = leaseActions(status);
      expect(actions.renew, `renovar ${status}`).toBe(
        !throwsDomain(() => {
          assertRenewal({
            status,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            newEndDate: '2027-12-31',
          });
        }),
      );
      expect(actions.end, `encerrar ${status}`).toBe(
        !throwsDomain(() => planLeaseEnd({ status, endDate: '2030-01-01', today: '2026-09-17' })),
      );
    }
  });

  it('reajuste e encargos só em locação em vigor; status desconhecido não oferece nada', () => {
    expect(leaseActions('ACTIVE')).toEqual({
      editTerms: true,
      renew: true,
      readjust: true,
      end: true,
    });
    expect(leaseActions('TERMINATING')).toEqual({
      editTerms: true,
      renew: false,
      readjust: true,
      end: true,
    });
    expect(leaseActions('PENDING')).toMatchObject({ readjust: false });
    expect(leaseActions('ENDED')).toEqual({
      editTerms: false,
      renew: false,
      readjust: false,
      end: false,
    });
    expect(leaseActions('OUTRO')).toEqual({
      editTerms: false,
      renew: false,
      readjust: false,
      end: false,
    });
  });
});

describe('reajuste', () => {
  it('prévia do aluguel igual à do domínio', () => {
    for (const [rent, bps] of [
      [100_000, 452],
      [99_999, 333],
      [250_000, -125],
      [123_457, 1],
      [1, 10_000],
    ] as const) {
      expect(readjustedRentPreview(rent, bps), `${String(rent)} × ${String(bps)}`).toBe(
        readjustedRent(rent, bps),
      );
    }
    expect(readjustedRentPreview(100_000, -10_000)).toBeNull();
  });

  it('base do reajuste: aluguel do mês pelo histórico, igual ao domínio', () => {
    const base = {
      previousEndDate: null,
      newEndDate: null,
      indexName: null,
      adjustmentBps: null,
      reason: null,
    };
    // Como a API devolve: do mais recente ao mais antigo.
    const newestFirst = [
      {
        ...base,
        kind: 'READJUSTMENT',
        effectiveFrom: '2027-03-01',
        previousRentCents: 105_000,
        newRentCents: 104_000,
      },
      {
        ...base,
        kind: 'READJUSTMENT',
        effectiveFrom: '2027-03-01',
        previousRentCents: 100_000,
        newRentCents: 105_000,
      },
      {
        ...base,
        kind: 'RENEWAL',
        effectiveFrom: null,
        previousRentCents: null,
        newRentCents: null,
      },
      {
        ...base,
        kind: 'RENEWAL',
        effectiveFrom: '2026-11-01',
        previousRentCents: 90_000,
        newRentCents: 100_000,
      },
    ];
    const changes = rentChangesOf(newestFirst);
    expect(changes.map((change) => change.newRentCents)).toEqual([100_000, 105_000, 104_000]);
    for (const period of ['2026-10-01', '2026-11-01', '2027-02-01', '2027-03-01', '2027-12-01']) {
      expect(rentForPeriodPreview(104_000, changes, period), period).toBe(
        rentForPeriod(104_000, changes, period),
      );
    }
    // No mesmo mês vale a mudança registrada por último (a correção).
    expect(rentForPeriodPreview(104_000, changes, '2027-03-01')).toBe(104_000);
    expect(rentForPeriodPreview(90_000, [], '2027-03-01')).toBe(90_000);
  });

  it('por índice ou por valor, no primeiro dia do mês escolhido', () => {
    const lease = { startDate: '2026-09-17', endDate: null };
    expect(
      parseReadjustment({
        ...lease,
        month: '2026-11',
        indexName: 'IPCA',
        mode: 'PERCENT',
        percent: '4,52',
        newRentCents: null,
      }),
    ).toEqual({
      ok: true,
      value: { effectiveFrom: '2026-11-01', indexName: 'IPCA', adjustmentBps: 452 },
    });
    expect(
      parseReadjustment({
        ...lease,
        month: '2026-11',
        indexName: 'OUTRO',
        mode: 'AMOUNT',
        percent: '4,52',
        newRentCents: 261_300,
      }),
    ).toEqual({
      ok: true,
      value: { effectiveFrom: '2026-11-01', indexName: 'OUTRO', newMonthlyRentCents: 261_300 },
    });
  });

  it('mês fora da vigência segue o domínio', () => {
    const lease = { startDate: '2026-09-17', endDate: '2027-01-31' };
    for (const month of ['2026-08', '2026-09', '2027-01', '2027-02']) {
      const parsed = parseReadjustment({
        ...lease,
        month,
        indexName: 'IGPM',
        mode: 'PERCENT',
        percent: '3',
        newRentCents: null,
      });
      const domainRefuses = (() => {
        try {
          assertReadjustmentWithinLease({ ...lease, effectiveFrom: `${month}-01` });
          return false;
        } catch {
          return true;
        }
      })();
      expect(parsed.ok, month).toBe(!domainRefuses);
    }
  });

  it('acusa mês, índice e valor ausentes', () => {
    expect(
      parseReadjustment({
        startDate: '2026-09-17',
        endDate: null,
        month: '',
        indexName: '',
        mode: 'PERCENT',
        percent: '-100',
        newRentCents: null,
      }),
    ).toEqual({
      ok: false,
      errors: {
        month: 'Escolha o mês em que o novo aluguel começa.',
        indexName: 'Escolha o índice do reajuste.',
        percent: 'Informe o índice entre -99,99% e 100%, como 4,52.',
      },
    });
    expect(
      parseReadjustment({
        startDate: '2026-09-17',
        endDate: null,
        month: '2026-10',
        indexName: 'IGPM',
        mode: 'AMOUNT',
        percent: '',
        newRentCents: 0,
      }),
    ).toEqual({ ok: false, errors: { newRent: 'Informe o novo aluguel.' } });
  });
});

describe('renovação', () => {
  it('nova data depois do término atual (ou do início); aluguel novo opcional', () => {
    expect(
      parseRenewal({
        startDate: '2026-09-17',
        currentEndDate: '2027-09-16',
        endDate: '2028-09-16',
        newRentCents: null,
      }),
    ).toEqual({ ok: true, value: { endDate: '2028-09-16' } });
    expect(
      parseRenewal({
        startDate: '2026-09-17',
        currentEndDate: null,
        endDate: '2028-09-16',
        newRentCents: 300_000,
      }),
    ).toEqual({ ok: true, value: { endDate: '2028-09-16', monthlyRentCents: 300_000 } });
    expect(
      parseRenewal({
        startDate: '2026-09-17',
        currentEndDate: '2027-09-16',
        endDate: '2027-09-16',
        newRentCents: null,
      }),
    ).toEqual({
      ok: false,
      errors: { endDate: 'A nova data de término precisa ser depois do término atual.' },
    });
    expect(
      parseRenewal({ startDate: '2026-09-17', currentEndDate: null, endDate: '', newRentCents: 0 }),
    ).toEqual({
      ok: false,
      errors: {
        endDate: 'Informe a nova data de término.',
        newRent: 'O novo aluguel precisa ser maior que zero.',
      },
    });
  });

  it('aluguel novo começa no mês seguinte ao término atual, ou no próximo mês', () => {
    expect(renewalRentStartsAt('2027-09-16', '2026-09-17')).toBe('2027-09-01');
    expect(renewalRentStartsAt('2027-09-30', '2026-09-17')).toBe('2027-10-01');
    expect(renewalRentStartsAt('2027-12-31', '2026-09-17')).toBe('2028-01-01');
    expect(renewalRentStartsAt(null, '2026-12-17')).toBe('2027-01-01');
  });
});

describe('encerramento', () => {
  it('data e motivo obrigatórios; término não antes do início', () => {
    expect(
      parseLeaseEnd({ startDate: '2026-09-17', endDate: '2026-12-31', reason: '  Acordo  ' }),
    ).toEqual({ ok: true, value: { endDate: '2026-12-31', reason: 'Acordo' } });
    expect(parseLeaseEnd({ startDate: '2026-09-17', endDate: '2026-09-16', reason: 'ok' })).toEqual(
      {
        ok: false,
        errors: {
          endDate: 'O término não pode ser antes do início da locação.',
          reason: 'Descreva o motivo em pelo menos 3 caracteres.',
        },
      },
    );
    expect(
      parseLeaseEnd({ startDate: '2026-09-17', endDate: '', reason: 'x'.repeat(501) }),
    ).toEqual({
      ok: false,
      errors: {
        endDate: 'Informe a data de término.',
        reason: 'O motivo tem no máximo 500 caracteres.',
      },
    });
  });

  it('resultado igual ao do domínio: data passada encerra já', () => {
    for (const endDate of ['2026-09-16', '2026-09-17', '2026-12-31']) {
      const plan = planLeaseEnd({ status: 'ACTIVE', endDate, today: '2026-09-17' });
      expect(endOutcome(endDate, '2026-09-17'), endDate).toBe(plan[plan.length - 1]);
    }
  });

  it('cobranças não pagas de meses depois do término', () => {
    const charges = [
      { id: 'a', periodStart: '2026-12-01', status: 'OPEN' },
      { id: 'b', periodStart: '2027-01-01', status: 'OVERDUE' },
      { id: 'c', periodStart: '2027-02-01', status: 'SCHEDULED' },
      { id: 'd', periodStart: '2027-02-01', status: 'PAID' },
      { id: 'e', periodStart: '2027-03-01', status: 'CANCELLED' },
    ];
    expect(unpaidChargesAfterEnd(charges, '2026-12-15').map((c) => c.id)).toEqual(['b', 'c']);
    expect(unpaidChargesAfterEnd(charges, null)).toEqual([]);
  });
});

describe('histórico da locação', () => {
  const fmt = {
    money: (cents: number) => `R$ ${String(cents / 100)}`,
    date: (iso: string) => iso.split('-').reverse().join('/'),
  };

  it('reajuste por índice', () => {
    expect(
      describeAmendment(
        {
          kind: 'READJUSTMENT',
          effectiveFrom: '2026-11-01',
          previousEndDate: null,
          newEndDate: null,
          previousRentCents: 250_000,
          newRentCents: 261_300,
          indexName: 'IPCA',
          adjustmentBps: 452,
          reason: null,
        },
        fmt,
      ),
    ).toEqual({
      title: 'Reajuste',
      lines: ['Aluguel: R$ 2500 → R$ 2613 a partir de 11/2026', 'Índice: IPCA (+4,52%)'],
    });
  });

  it('reajuste por valor informado', () => {
    expect(
      describeAmendment(
        {
          kind: 'READJUSTMENT',
          effectiveFrom: '2027-01-01',
          previousEndDate: null,
          newEndDate: null,
          previousRentCents: 250_000,
          newRentCents: 240_000,
          indexName: 'OUTRO',
          adjustmentBps: null,
          reason: null,
        },
        fmt,
      ).lines,
    ).toEqual([
      'Aluguel: R$ 2500 → R$ 2400 a partir de 01/2027',
      'Índice: Outro índice (valor informado)',
    ]);
  });

  it('renovação com e sem aluguel novo', () => {
    expect(
      describeAmendment(
        {
          kind: 'RENEWAL',
          effectiveFrom: null,
          previousEndDate: null,
          newEndDate: '2029-12-31',
          previousRentCents: null,
          newRentCents: null,
          indexName: null,
          adjustmentBps: null,
          reason: null,
        },
        fmt,
      ),
    ).toEqual({ title: 'Renovação', lines: ['Término: sem data → 31/12/2029'] });
    expect(
      describeAmendment(
        {
          kind: 'RENEWAL',
          effectiveFrom: '2030-01-01',
          previousEndDate: '2029-12-31',
          newEndDate: '2031-12-31',
          previousRentCents: 250_000,
          newRentCents: 270_000,
          indexName: null,
          adjustmentBps: null,
          reason: null,
        },
        fmt,
      ).lines,
    ).toEqual([
      'Término: 31/12/2029 → 31/12/2031',
      'Aluguel: R$ 2500 → R$ 2700 a partir de 01/2030',
    ]);
  });

  it('encerramento', () => {
    expect(
      describeAmendment(
        {
          kind: 'TERMINATION',
          effectiveFrom: null,
          previousEndDate: '2029-12-31',
          newEndDate: '2026-12-31',
          previousRentCents: null,
          newRentCents: null,
          indexName: null,
          adjustmentBps: null,
          reason: 'Acordo entre as partes',
        },
        fmt,
      ),
    ).toEqual({
      title: 'Encerramento',
      lines: ['Término: 31/12/2026', 'Motivo: Acordo entre as partes'],
    });
  });
});
