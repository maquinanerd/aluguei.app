import { describe, expect, it } from 'vitest';
import * as contracts from '@aluguei/contracts';
import * as labels from './labels';
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

describe('conciliação: a tela usa o vocabulário do contrato', () => {
  const sorted = (values: readonly string[]): string[] => [...values].sort();

  it('as opções do filtro de status são as que a API aceita e a coluna guarda', () => {
    const accepted = contracts.listReconciliationsQuerySchema.shape.status.unwrap().options;
    expect(sorted(Object.keys(labels.RECONCILIATION_STATUS_LABELS))).toEqual(sorted(accepted));
    expect(sorted(accepted)).toEqual(sorted(contracts.reconciliationSchema.shape.status.options));
    expect(sorted(Object.keys(labels.RECONCILIATION_STATUS_TONES))).toEqual(sorted(accepted));
  });

  it('todo provider da conciliação tem label, inclusive a conciliação sem provider', () => {
    const providers: Record<string, string> = labels.RECONCILIATION_PROVIDER_LABELS;
    expect(sorted(Object.keys(providers))).toEqual(
      sorted(contracts.reconciliationProviderSchema.options),
    );
    expect(label(providers, 'NONE')).toBe('Sem provedor');
  });
});
