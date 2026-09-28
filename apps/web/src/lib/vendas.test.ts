import { describe, expect, it } from 'vitest';
import { COLUNAS_DO_QUADRO, ETAPAS_NEGOCIACAO, ETAPA_ROTULO, percentualLegivel } from './vendas';

/**
 * Vocabulário da venda no painel (Onda 5). O risco que estes testes cobrem é
 * silencioso: uma etapa nova no domínio que ninguém traduz some do quadro sem
 * erro nenhum — a negociação simplesmente desaparece da tela.
 */

describe('etapas', () => {
  it('toda etapa tem rótulo', () => {
    for (const etapa of ETAPAS_NEGOCIACAO) {
      expect(ETAPA_ROTULO[etapa]).toBeTruthy();
    }
  });

  it('o quadro mostra as abertas e a fechada; perdida é histórico', () => {
    expect(COLUNAS_DO_QUADRO).toEqual([
      'PROPOSAL',
      'COUNTER',
      'DOCUMENTATION',
      'CONTRACT',
      'CLOSED',
    ]);
    expect(COLUNAS_DO_QUADRO).not.toContain('LOST');
  });
});

describe('percentual', () => {
  it('mostra 5% sem casa decimal inventada, e 2,5% quando existe', () => {
    expect(percentualLegivel(500)).toBe('5%');
    expect(percentualLegivel(250)).toBe('2.50%');
    expect(percentualLegivel(0)).toBe('0%');
  });
});
