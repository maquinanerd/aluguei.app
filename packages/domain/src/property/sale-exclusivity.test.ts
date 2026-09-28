import { describe, expect, it } from 'vitest';
import {
  SALE_EXCLUSIVITY_WARNING_DAYS,
  assertValidExclusivityPeriod,
  daysBetween,
  exclusivityStatus,
  isExclusivityInForce,
  periodsOverlap,
} from './sale-exclusivity';

/**
 * Exclusividade de venda (Onda 5). O que estes testes seguram é a promessa que
 * a tela faz: aviso antes do fim, contado do fim para trás, e duas autorizações
 * válidas ao mesmo tempo não existindo.
 */

describe('período', () => {
  it('conta dias sem depender do fuso de quem pergunta', () => {
    expect(daysBetween('2026-09-22', '2026-12-22')).toBe(91);
    expect(daysBetween('2026-12-22', '2026-09-22')).toBe(-91);
    // Travessia de horário de verão no hemisfério norte: ainda são 31 dias.
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });

  it('recusa fim antes do início e fim igual ao início', () => {
    expect(() => {
      assertValidExclusivityPeriod({ startsOn: '2026-09-22', endsOn: '2026-09-01' });
    }).toThrow(/depois do início/);
    expect(() => {
      assertValidExclusivityPeriod({ startsOn: '2026-09-22', endsOn: '2026-09-22' });
    }).toThrow();
    // Um dia é curto, mas é legítimo.
    expect(() => {
      assertValidExclusivityPeriod({ startsOn: '2026-09-22', endsOn: '2026-09-23' });
    }).not.toThrow();
  });
});

describe('situação em uma data', () => {
  const periodo = { startsOn: '2026-09-22', endsOn: '2026-12-22' };

  it('antes de começar, está agendada', () => {
    expect(exclusivityStatus(periodo, '2026-09-01').state).toBe('SCHEDULED');
  });

  it('no meio, está ativa, e a duração total é a do período', () => {
    const status = exclusivityStatus(periodo, '2026-10-01');
    expect(status.state).toBe('ACTIVE');
    expect(status.totalDays).toBe(91);
    expect(status.daysLeft).toBe(82);
  });

  it('avisa nos últimos 15 dias, contados do fim', () => {
    const limite = exclusivityStatus(periodo, '2026-12-07');
    expect(limite.daysLeft).toBe(SALE_EXCLUSIVITY_WARNING_DAYS);
    expect(limite.state).toBe('ENDING_SOON');
    // Um dia antes do limite ainda é rotina.
    expect(exclusivityStatus(periodo, '2026-12-06').state).toBe('ACTIVE');
    // O último dia ainda vale.
    expect(exclusivityStatus(periodo, '2026-12-22').state).toBe('ENDING_SOON');
  });

  it('depois do fim, vencida; cancelada nunca volta a valer', () => {
    expect(exclusivityStatus(periodo, '2026-12-23').state).toBe('EXPIRED');
    expect(
      exclusivityStatus({ ...periodo, canceledAt: '2026-10-01T00:00:00.000Z' }, '2026-10-02').state,
    ).toBe('CANCELED');
  });

  it('só ativa e a vencer valem hoje', () => {
    expect(isExclusivityInForce(exclusivityStatus(periodo, '2026-10-01'))).toBe(true);
    expect(isExclusivityInForce(exclusivityStatus(periodo, '2026-12-10'))).toBe(true);
    expect(isExclusivityInForce(exclusivityStatus(periodo, '2026-09-01'))).toBe(false);
    expect(isExclusivityInForce(exclusivityStatus(periodo, '2027-01-01'))).toBe(false);
  });
});

describe('sobreposição', () => {
  const periodo = { startsOn: '2026-09-22', endsOn: '2026-12-22' };

  it('período que encosta no fim do outro não sobrepõe (é renovação)', () => {
    expect(periodsOverlap(periodo, { startsOn: '2026-12-22', endsOn: '2027-03-22' })).toBe(false);
    expect(periodsOverlap(periodo, { startsOn: '2026-06-22', endsOn: '2026-09-22' })).toBe(false);
  });

  it('período que invade um dia do outro sobrepõe', () => {
    expect(periodsOverlap(periodo, { startsOn: '2026-12-21', endsOn: '2027-03-22' })).toBe(true);
    expect(periodsOverlap(periodo, { startsOn: '2026-10-01', endsOn: '2026-10-15' })).toBe(true);
    expect(periodsOverlap(periodo, { startsOn: '2026-01-01', endsOn: '2027-01-01' })).toBe(true);
  });
});
