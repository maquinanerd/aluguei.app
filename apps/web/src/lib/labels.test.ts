import { describe, expect, it } from 'vitest';
import { label, FUNNEL_LABELS, ROLE_LABELS, CHARGE_STATUS_LABELS } from './labels';

describe('labels de domínio', () => {
  it('funil tem labels pt-BR', () => {
    expect(FUNNEL_LABELS.NEW).toBe('Novo');
    expect(FUNNEL_LABELS.WON).toBe('Fechado');
    expect(FUNNEL_LABELS.LOST).toBe('Perdido');
  });

  it('roles tem labels pt-BR', () => {
    expect(ROLE_LABELS.agent).toBe('Corretor');
    expect(ROLE_LABELS.finance).toBe('Financeiro');
  });

  it('label faz fallback para valor bruto', () => {
    expect(label(CHARGE_STATUS_LABELS, 'PAID')).toBe('Paga');
    expect(label(CHARGE_STATUS_LABELS, 'UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
    expect(label(CHARGE_STATUS_LABELS, null)).toBe('—');
  });
});
