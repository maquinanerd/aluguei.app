import { describe, expect, it } from 'vitest';
import {
  MAX_COMMISSION_BPS,
  SALE_NEGOTIATION_STAGES,
  assertNegotiationTransition,
  assertSharesTotal100,
  canMoveNegotiation,
  commissionCents,
  documentProgress,
  splitCommission,
} from './negotiation';

/**
 * Negociação de venda (Onda 5). O que estes testes seguram é o que não pode
 * divergir entre tela, API e relatório: até onde cada etapa anda e a conta da
 * comissão, que é dinheiro de gente.
 */

describe('etapas', () => {
  it('não pula o meio nem ressuscita negociação encerrada', () => {
    expect(canMoveNegotiation('PROPOSAL', 'CONTRACT')).toBe(false);
    expect(canMoveNegotiation('CLOSED', 'CONTRACT')).toBe(false);
    expect(canMoveNegotiation('LOST', 'PROPOSAL')).toBe(false);
    expect(() => {
      assertNegotiationTransition('CLOSED', 'PROPOSAL');
    }).toThrow(/encerrada/);
  });

  it('deixa voltar, porque documentação que não vem faz voltar', () => {
    expect(canMoveNegotiation('DOCUMENTATION', 'COUNTER')).toBe(true);
    expect(canMoveNegotiation('CONTRACT', 'DOCUMENTATION')).toBe(true);
  });

  it('qualquer etapa aberta pode virar perdida, e ficar parado é permitido', () => {
    for (const etapa of SALE_NEGOTIATION_STAGES) {
      if (etapa === 'CLOSED' || etapa === 'LOST') {
        continue;
      }
      expect(canMoveNegotiation(etapa, 'LOST')).toBe(true);
    }
    expect(() => {
      assertNegotiationTransition('PROPOSAL', 'PROPOSAL');
    }).not.toThrow();
  });
});

describe('comissão', () => {
  it('é calculada sobre o valor negociado, arredondando para baixo', () => {
    // 5% de R$ 1.390.000,00 = R$ 69.500,00
    expect(commissionCents(139_000_000, 500)).toBe(6_950_000);
    // Arredonda para baixo: quem recebe não sai com centavo que não existe.
    expect(commissionCents(333, 500)).toBe(16);
  });

  it('recusa percentual fora da faixa, que é erro de digitação', () => {
    expect(() => commissionCents(139_000_000, MAX_COMMISSION_BPS + 1)).toThrow(/Comissão/);
    expect(() => commissionCents(139_000_000, -1)).toThrow(/Comissão/);
    expect(() => commissionCents(139_000_000, 1.5)).toThrow(/Comissão/);
  });

  it('as participações têm de somar 100%', () => {
    expect(() => {
      assertSharesTotal100([
        { role: 'CAPTADOR', percentBps: 4_000 },
        { role: 'VENDEDOR', percentBps: 5_000 },
      ]);
    }).toThrow(/100%/);
    expect(() => {
      assertSharesTotal100([]);
    }).not.toThrow();
  });

  it('a soma das partes é exatamente a comissão, sem centavo sobrando', () => {
    const comissao = commissionCents(139_000_000, 500);
    const partes = splitCommission(comissao, [
      { role: 'CAPTADOR', percentBps: 4_000 },
      { role: 'VENDEDOR', percentBps: 6_000 },
    ]);
    expect(partes).toEqual([
      { role: 'CAPTADOR', amountCents: 2_780_000 },
      { role: 'VENDEDOR', amountCents: 4_170_000 },
    ]);
    expect(partes.reduce((acc, parte) => acc + parte.amountCents, 0)).toBe(comissao);
  });

  it('divisão que não fecha redondo continua somando o total', () => {
    const partes = splitCommission(101, [
      { role: 'CAPTADOR', percentBps: 3_333 },
      { role: 'VENDEDOR', percentBps: 6_667 },
    ]);
    expect(partes.reduce((acc, parte) => acc + parte.amountCents, 0)).toBe(101);
  });
});

describe('documentação', () => {
  it('conta o que foi entregue, para o "5 de 8" da tela', () => {
    expect(documentProgress([{ provided: true }, { provided: true }, { provided: false }])).toEqual(
      { provided: 2, total: 3 },
    );
    expect(documentProgress([])).toEqual({ provided: 0, total: 0 });
  });
});
