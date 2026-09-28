import { DomainError } from '../errors.js';
import { assertSaleAmountWithinCeiling, mulBpsFloor, splitAmount } from '../finance/money.js';

/**
 * Negociação de venda (Onda 5): da proposta ao fechamento.
 *
 * O que mora aqui é o que não pode divergir entre tela, API e relatório: as
 * etapas e para onde cada uma pode ir, e a conta da comissão. Dinheiro continua
 * em centavo inteiro e a divisão usa o mesmo método do resto do sistema — a
 * soma das partes é sempre o total, sem centavo sobrando.
 */

export const SALE_NEGOTIATION_STAGES = [
  'PROPOSAL',
  'COUNTER',
  'DOCUMENTATION',
  'CONTRACT',
  'CLOSED',
  'LOST',
] as const;
export type SaleNegotiationStage = (typeof SALE_NEGOTIATION_STAGES)[number];

/**
 * Para onde cada etapa pode ir.
 *
 * Voltar é permitido de propósito: documentação que não vem faz a negociação
 * voltar para contraproposta, e isso acontece. O que não é permitido é pular o
 * meio (proposta direto para contrato) nem ressuscitar negociação fechada ou
 * perdida — fechada vira histórico, e reabrir seria apagar o que aconteceu.
 */
const TRANSICOES: Record<SaleNegotiationStage, readonly SaleNegotiationStage[]> = {
  PROPOSAL: ['COUNTER', 'DOCUMENTATION', 'LOST'],
  COUNTER: ['PROPOSAL', 'DOCUMENTATION', 'LOST'],
  DOCUMENTATION: ['COUNTER', 'CONTRACT', 'LOST'],
  CONTRACT: ['DOCUMENTATION', 'CLOSED', 'LOST'],
  CLOSED: [],
  LOST: [],
};

export function isSaleNegotiationStage(value: string): value is SaleNegotiationStage {
  return (SALE_NEGOTIATION_STAGES as readonly string[]).includes(value);
}

export function canMoveNegotiation(from: SaleNegotiationStage, to: SaleNegotiationStage): boolean {
  return TRANSICOES[from].includes(to);
}

export function assertNegotiationTransition(
  from: SaleNegotiationStage,
  to: SaleNegotiationStage,
): void {
  if (from === to) {
    return;
  }
  if (!canMoveNegotiation(from, to)) {
    throw new DomainError(
      'INVALID_INPUT',
      from === 'CLOSED' || from === 'LOST'
        ? 'Negociação encerrada não volta a andar'
        : `Uma negociação em ${from} não vai direto para ${to}`,
    );
  }
}

/** Quem propôs o quê, na ordem em que aconteceu. */
export const SALE_EVENT_KINDS = ['ASKING', 'BUYER_OFFER', 'SELLER_COUNTER'] as const;
export type SaleEventKind = (typeof SALE_EVENT_KINDS)[number];

export const SALE_EVENT_OUTCOMES = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
export type SaleEventOutcome = (typeof SALE_EVENT_OUTCOMES)[number];

export const SALE_DOCUMENT_SIDES = ['PROPERTY', 'BUYER', 'SELLER'] as const;
export type SaleDocumentSide = (typeof SALE_DOCUMENT_SIDES)[number];

export const SALE_COMMISSION_ROLES = ['CAPTADOR', 'VENDEDOR'] as const;
export type SaleCommissionRole = (typeof SALE_COMMISSION_ROLES)[number];

/** Teto da comissão: acima disto é erro de digitação, não negócio. */
export const MAX_COMMISSION_BPS = 3_000;

export function assertCommissionBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_COMMISSION_BPS) {
    throw new DomainError(
      'INVALID_INPUT',
      `Comissão deve estar entre 0 e ${String(MAX_COMMISSION_BPS / 100)}%`,
    );
  }
}

/**
 * Comissão sobre o valor negociado. Arredonda para baixo, como o resto do
 * sistema: quem recebe nunca sai com um centavo que não existe.
 */
export function commissionCents(amountCents: number, bps: number): number {
  // Escala de venda, não de aluguel: R$ 1,4 milhão é valor comum aqui.
  assertSaleAmountWithinCeiling(amountCents, 'valor da negociação');
  assertCommissionBps(bps);
  return mulBpsFloor(amountCents, bps);
}

export interface CommissionShare {
  role: SaleCommissionRole;
  /** Participação em basis points; a soma das participações é 100%. */
  percentBps: number;
}

export function assertSharesTotal100(shares: readonly CommissionShare[]): void {
  if (shares.length === 0) {
    return;
  }
  const total = shares.reduce((acc, share) => acc + share.percentBps, 0);
  if (total !== 10_000) {
    throw new DomainError('INVALID_INPUT', 'As participações da comissão têm de somar 100%');
  }
}

/**
 * Divide a comissão entre os participantes. Usa o método do maior resto
 * (`splitAmount`), então a soma das partes é exatamente a comissão — dividir
 * 69.500 em 40/60 não pode virar 69.499.
 */
export function splitCommission(
  commission: number,
  shares: readonly CommissionShare[],
): { role: SaleCommissionRole; amountCents: number }[] {
  assertSharesTotal100(shares);
  if (shares.length === 0) {
    return [];
  }
  const partes = splitAmount(
    commission,
    shares.map((share) => share.percentBps),
  );
  return shares.map((share, indice) => ({
    role: share.role,
    amountCents: partes[indice] ?? 0,
  }));
}

/** Percentual de documentos entregues, para "5 de 8" na tela. */
export function documentProgress(documents: readonly { provided: boolean }[]): {
  provided: number;
  total: number;
} {
  return {
    provided: documents.filter((documento) => documento.provided).length,
    total: documents.length,
  };
}
