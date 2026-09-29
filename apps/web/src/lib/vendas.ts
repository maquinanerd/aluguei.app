/**
 * Vocabulário e tipos da frente de venda no painel (Onda 5).
 *
 * As etapas e a ordem delas são as mesmas do domínio (`SALE_NEGOTIATION_STAGES`)
 * — o quadro mostra as colunas nessa ordem, e uma etapa nova no domínio tem de
 * aparecer aqui, senão some da tela sem ninguém notar.
 */

export const ETAPAS_NEGOCIACAO = [
  'PROPOSAL',
  'COUNTER',
  'DOCUMENTATION',
  'CONTRACT',
  'CLOSED',
  'LOST',
] as const;
export type EtapaNegociacao = (typeof ETAPAS_NEGOCIACAO)[number];

export const ETAPA_ROTULO: Record<EtapaNegociacao, string> = {
  PROPOSAL: 'Proposta',
  COUNTER: 'Contraproposta',
  DOCUMENTATION: 'Documentação',
  CONTRACT: 'Contrato',
  CLOSED: 'Fechada',
  LOST: 'Perdida',
};

export const ETAPA_TOM: Record<EtapaNegociacao, 'neutral' | 'warning' | 'success' | 'danger'> = {
  PROPOSAL: 'neutral',
  COUNTER: 'warning',
  DOCUMENTATION: 'neutral',
  CONTRACT: 'neutral',
  CLOSED: 'success',
  LOST: 'danger',
};

/** Colunas do quadro: encerradas não viram coluna, viram histórico. */
export const COLUNAS_DO_QUADRO: EtapaNegociacao[] = [
  'PROPOSAL',
  'COUNTER',
  'DOCUMENTATION',
  'CONTRACT',
  'CLOSED',
];

export const TIPO_EVENTO_ROTULO: Record<string, string> = {
  ASKING: 'Pedido do proprietário',
  BUYER_OFFER: 'Proposta do comprador',
  SELLER_COUNTER: 'Contraproposta do proprietário',
};

export const RESULTADO_EVENTO_ROTULO: Record<string, string> = {
  PENDING: 'Aguardando resposta',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  EXPIRED: 'Vencida',
};

export const RESULTADO_EVENTO_TOM: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
};

export const LADO_DOCUMENTO_ROTULO: Record<string, string> = {
  PROPERTY: 'Imóvel',
  BUYER: 'Comprador',
  SELLER: 'Vendedor',
};

export const PAPEL_COMISSAO_ROTULO: Record<string, string> = {
  CAPTADOR: 'Captador',
  VENDEDOR: 'Vendedor',
};

export interface EventoNegociacao {
  id: string;
  kind: string;
  amountCents: number;
  validUntil: string | null;
  outcome: string;
  note: string | null;
  createdAt: string;
}

export interface DocumentoNegociacao {
  id: string;
  side: string;
  label: string;
  provided: boolean;
  providedAt: string | null;
}

export interface ParticipacaoComissao {
  role: string;
  userId: string | null;
  percentBps: number;
  amountCents: number;
}

export interface Negociacao {
  id: string;
  propertyId: string;
  buyerPartyId: string;
  stage: EtapaNegociacao;
  askingPriceCents: number | null;
  currentAmountCents: number | null;
  commissionBps: number;
  commissionCents: number | null;
  closedAt: string | null;
  closedAmountCents: number | null;
  lostReason: string | null;
  documents: { provided: number; total: number };
  createdAt: string;
  updatedAt: string;
}

export interface NegociacaoDetalhe extends Negociacao {
  events: EventoNegociacao[];
  documentList: DocumentoNegociacao[];
  commissionShares: ParticipacaoComissao[];
}

/** "5%" a partir de basis points, sem casa decimal inventada. */
export function percentualLegivel(bps: number): string {
  const percentual = bps / 100;
  return `${Number.isInteger(percentual) ? String(percentual) : percentual.toFixed(2)}%`;
}
