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

describe('canais (ADR-107): todo estado e todo canal do contrato têm nome', () => {
  const sorted = (values: readonly string[]): string[] => [...values].sort();

  it('estados de publicação, inclusive os do feed, têm nome e tom', () => {
    const estados = sorted(contracts.channelPublicationStatusSchema.options);
    expect(sorted(Object.keys(labels.CHANNEL_STATUS_LABELS))).toEqual(estados);
    expect(sorted(Object.keys(labels.CHANNEL_STATUS_TONES))).toEqual(estados);
    expect(labels.CHANNEL_STATUS_LABELS.AWAITING_IMPORT).toBe('No feed, aguardando relatório');
  });

  it('todo canal e todo estágio de integração têm nome; nenhum estágio se diz conectado', () => {
    expect(sorted(Object.keys(labels.CHANNEL_TYPE_LABELS))).toEqual(
      sorted(contracts.channelTypeSchema.options),
    );
    expect(sorted(Object.keys(labels.INTEGRATION_STAGE_LABELS))).toEqual(
      sorted(contracts.integrationStageSchema.options),
    );
    for (const texto of Object.values(labels.INTEGRATION_STAGE_LABELS)) {
      expect(texto.toLowerCase()).not.toContain('conectado');
    }
  });
});

describe('vistoria: o nome que o cliente vê cobre todo tipo do contrato', () => {
  it('cada tipo de vistoria tem nome, e nenhum nome é de tipo inexistente', () => {
    // Onda 0 da rodada de fidelidade, defeito 7: a área do inquilino comparava com 'ENTRY'.
    const tipos = [...contracts.inspectionTypeSchema.options].sort();
    expect(Object.keys(labels.INSPECTION_TITLE_LABELS).sort()).toEqual(tipos);
    expect(labels.INSPECTION_TITLE_LABELS.CHECKIN).toBe('Vistoria de entrada');
    expect(labels.INSPECTION_TITLE_LABELS.CHECKOUT).toBe('Vistoria de saída');
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
