import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  isBankHoliday,
  isBusinessDay,
  monthStartOf,
  nextBusinessDay,
  nextMonthStart,
  saoPauloDate,
} from './calendar.js';

/**
 * Calendário bancário nacional para vencimentos (auditoria 2026-09-10, P1-07): cobrança que vence
 * em fim de semana ou feriado pode ser paga sem encargo no dia útil seguinte, e "hoje" é a data de
 * São Paulo, não a UTC (entre 21h e meia-noite a data UTC já é o dia seguinte).
 */
describe('feriados bancários nacionais', () => {
  it.each([
    ['2026-01-01', 'Confraternização Universal'],
    ['2026-02-16', 'Carnaval (segunda)'],
    ['2026-02-17', 'Carnaval (terça)'],
    ['2026-04-03', 'Sexta-feira Santa'],
    ['2026-04-21', 'Tiradentes'],
    ['2026-05-01', 'Dia do Trabalho'],
    ['2026-06-04', 'Corpus Christi'],
    ['2026-09-07', 'Independência'],
    ['2026-10-12', 'Nossa Senhora Aparecida'],
    ['2026-11-02', 'Finados'],
    ['2026-11-15', 'Proclamação da República'],
    ['2026-11-20', 'Consciência Negra'],
    ['2026-12-25', 'Natal'],
    ['2027-02-09', 'Carnaval de 2027 (terça)'],
    ['2025-06-19', 'Corpus Christi de 2025'],
  ])('%s é feriado (%s)', (date) => {
    expect(isBankHoliday(date)).toBe(true);
    expect(isBusinessDay(date)).toBe(false);
  });

  it('Consciência Negra só é feriado nacional a partir de 2024', () => {
    expect(isBankHoliday('2023-11-20')).toBe(false);
    expect(isBankHoliday('2024-11-20')).toBe(true);
  });

  it('dia comum de semana é útil; sábado e domingo não', () => {
    expect(isBusinessDay('2026-03-10')).toBe(true);
    expect(isBusinessDay('2026-10-10')).toBe(false);
    expect(isBusinessDay('2026-10-11')).toBe(false);
  });
});

describe('próximo dia útil', () => {
  it('sábado seguido de domingo e feriado na segunda vai para a terça', () => {
    expect(nextBusinessDay('2026-10-10')).toBe('2026-10-13');
  });

  it('Sexta-feira Santa vai para a segunda depois da Páscoa', () => {
    expect(nextBusinessDay('2026-04-03')).toBe('2026-04-06');
  });

  it('dia útil não muda', () => {
    expect(nextBusinessDay('2026-08-10')).toBe('2026-08-10');
  });
});

describe('datas no fuso de São Paulo', () => {
  it('23h30 em São Paulo ainda é o mesmo dia, embora em UTC já seja o seguinte', () => {
    expect(saoPauloDate(new Date('2026-10-01T02:30:00.000Z'))).toBe('2026-09-30');
    expect(saoPauloDate(new Date('2026-10-01T03:00:00.000Z'))).toBe('2026-10-01');
  });

  it('soma e diferença de dias de calendário', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(daysBetween('2026-10-10', '2026-10-20')).toBe(10);
    expect(daysBetween('2026-03-10', '2026-06-18')).toBe(100);
    expect(daysBetween('2026-10-20', '2026-10-10')).toBe(-10);
  });

  it('início do mês e do mês seguinte, inclusive na virada do ano', () => {
    expect(monthStartOf('2026-10-17')).toBe('2026-10-01');
    expect(nextMonthStart('2026-10-17')).toBe('2026-11-01');
    expect(nextMonthStart('2026-12-31')).toBe('2027-01-01');
  });
});
