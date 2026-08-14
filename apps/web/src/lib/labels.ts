/**
 * Labels e tons semânticos por status de domínio. Apresentação apenas —
 * nenhuma regra de negócio mora aqui.
 */
import type { BadgeTone } from '@aluguei/ui';

export const FUNNEL_LABELS: Record<string, string> = {
  NEW: 'Novo',
  QUALIFYING: 'Qualificando',
  QUALIFIED: 'Qualificado',
  VISIT: 'Visita',
  PROPOSAL: 'Proposta',
  APPLICATION: 'Crédito',
  WON: 'Fechado',
  LOST: 'Perdido',
};

export const FUNNEL_TONES: Record<string, BadgeTone> = {
  NEW: 'info',
  QUALIFYING: 'neutral',
  QUALIFIED: 'brand',
  VISIT: 'warning',
  PROPOSAL: 'warning',
  APPLICATION: 'brand',
  WON: 'success',
  LOST: 'danger',
};

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário da conta',
  admin: 'Administrador',
  agent: 'Corretor',
  inspector: 'Vistoriador',
  finance: 'Financeiro',
  viewer: 'Leitura',
};

export const PARTY_TYPE_LABELS: Record<string, string> = {
  PERSON: 'Pessoa física',
  COMPANY: 'Pessoa jurídica',
};

export const PARTY_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  TENANT: 'Locatário',
  GUARANTOR: 'Fiador',
  BROKER: 'Corretor',
  LEGAL_REPRESENTATIVE: 'Representante legal',
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: 'Apartamento',
  HOUSE: 'Casa',
  COMMERCIAL: 'Comercial',
  LAND: 'Terreno',
};

export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado',
};

export const LISTING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  READY: 'Pronto',
  PUBLISHED: 'Publicado',
  PAUSED: 'Pausado',
  ARCHIVED: 'Arquivado',
};

export const LISTING_STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  READY: 'info',
  PUBLISHED: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'neutral',
};

export const CHANNEL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PUBLISHING: 'Publicando',
  PUBLISHED: 'Publicado',
  UPDATE_PENDING: 'Atualização pendente',
  REMOVING: 'Removendo',
  REMOVED: 'Removido',
  FAILED: 'Falhou',
  RECONCILING: 'Reconciliando',
};

export const CHANNEL_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'neutral',
  PUBLISHING: 'info',
  PUBLISHED: 'success',
  UPDATE_PENDING: 'warning',
  REMOVING: 'info',
  REMOVED: 'neutral',
  FAILED: 'danger',
  RECONCILING: 'warning',
};

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  fake: 'Canal de teste',
  canalpro: 'CanalPro',
  vivareal: 'Viva Real',
  zap: 'ZAP Imóveis',
  olx: 'OLX',
  imovelweb: 'Imóvel Web',
};

export const VISIT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  DONE: 'Realizada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'Não compareceu',
};

export const VISIT_STATUS_TONES: Record<string, BadgeTone> = {
  SCHEDULED: 'info',
  CONFIRMED: 'brand',
  DONE: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'warning',
};

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviada',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  EXPIRED: 'Expirada',
};

export const PROPOSAL_STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviada',
  SCREENING: 'Em análise',
  MANUAL_REVIEW: 'Revisão manual',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  CONTRACTING: 'Contratação',
};

export const APPLICATION_STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  SCREENING: 'warning',
  MANUAL_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CONTRACTING: 'brand',
};

export const SCREENING_DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Aprovar',
  REVIEW: 'Revisar',
  REJECT: 'Rejeitar',
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  GENERATED: 'Gerado',
  SENT_FOR_SIGNATURE: 'Aguardando assinatura',
  PARTIALLY_SIGNED: 'Parcialmente assinado',
  SIGNED: 'Assinado',
  VOID: 'Cancelado',
};

export const CONTRACT_STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  GENERATED: 'info',
  SENT_FOR_SIGNATURE: 'warning',
  PARTIALLY_SIGNED: 'warning',
  SIGNED: 'success',
  VOID: 'danger',
};

export const INSPECTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  CAPTURING: 'Capturando',
  PROCESSING: 'Processando',
  REVIEW: 'Revisão',
  COMPLETED: 'Concluída',
  SIGNED: 'Assinada',
};

export const INSPECTION_STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  CAPTURING: 'info',
  PROCESSING: 'warning',
  REVIEW: 'warning',
  COMPLETED: 'success',
  SIGNED: 'brand',
};

export const LEASE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  ACTIVE: 'Ativa',
  DELINQUENT: 'Inadimplente',
  TERMINATING: 'Encerrando',
  ENDED: 'Encerrada',
};

export const LEASE_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'neutral',
  ACTIVE: 'success',
  DELINQUENT: 'danger',
  TERMINATING: 'warning',
  ENDED: 'neutral',
};

export const CHARGE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendada',
  OPEN: 'Aberta',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Estornada',
};

export const CHARGE_STATUS_TONES: Record<string, BadgeTone> = {
  SCHEDULED: 'info',
  OPEN: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  FAILED: 'Falhou',
  REFUNDED: 'Estornado',
};

export const PAYMENT_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  FAILED: 'danger',
  REFUNDED: 'neutral',
};

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  FAILED: 'Falhou',
};

export const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  ACTIVE: 'Ativa',
  NEEDS_HUMAN: 'Precisa de humano',
  CLOSED: 'Encerrada',
};

export const CONVERSATION_STATUS_TONES: Record<string, BadgeTone> = {
  OPEN: 'info',
  ACTIVE: 'brand',
  NEEDS_HUMAN: 'danger',
  CLOSED: 'neutral',
};

export const META_CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  CREATED_PAUSED: 'Criada (pausada)',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  ARCHIVED: 'Arquivada',
};

export const META_CAMPAIGN_STATUS_TONES: Record<string, BadgeTone> = {
  CREATED_PAUSED: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'neutral',
};

export const META_AD_PROFILE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PREPARED: 'Preparado',
  CREATED: 'Criado',
  PUBLISHED: 'Publicado',
  PAUSED: 'Pausado',
  ARCHIVED: 'Arquivado',
};

export const META_AD_PROFILE_STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  PREPARED: 'info',
  CREATED: 'brand',
  PUBLISHED: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'neutral',
};

export const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  MATCHED: 'Conciliado',
  DISCREPANCY: 'Divergência',
};

export const RECONCILIATION_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  MATCHED: 'success',
  DISCREPANCY: 'danger',
};

/** Helper genérico: label com fallback para o valor bruto. */
export function label(map: Record<string, string>, value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return map[value] ?? value;
}
