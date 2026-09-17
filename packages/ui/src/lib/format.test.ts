import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

/**
 * G3, trilha C: datas civis (vencimento e período da cobrança, início e término da locação) chegam
 * da API como `AAAA-MM-DD`. `new Date('2026-10-10')` é meia-noite UTC, que no fuso de São Paulo
 * (UTC-3) ainda é o dia 9: o painel mostrava o vencimento um dia antes do combinado.
 */
describe('formatDate no fuso de São Paulo', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Sao_Paulo';
  });

  afterAll(() => {
    if (originalTz === undefined) {
      Reflect.deleteProperty(process.env, 'TZ');
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('data civil AAAA-MM-DD sai no mesmo dia', () => {
    expect(formatDate('2026-10-10')).toBe('10/10/2026');
    expect(formatDate('2027-01-01')).toBe('01/01/2027');
    expect(formatDate('2028-02-29')).toBe('29/02/2028');
  });

  it('instante com hora continua convertido para o fuso local', () => {
    expect(formatDate('2026-10-10T02:00:00.000Z')).toBe('09/10/2026');
    expect(formatDateTime('2026-10-10T15:30:00.000Z')).toBe('10/10/2026, 12:30');
  });

  it('data inexistente ou vazia vira travessão', () => {
    expect(formatDate('2026-13-45')).toBe('—');
    expect(formatDate('2027-02-29')).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate(null)).toBe('—');
  });
});
