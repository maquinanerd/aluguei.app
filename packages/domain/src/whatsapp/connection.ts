/**
 * Conexão do número do WhatsApp com a organização (auditoria 2026-09-10, P1-18, segunda parte).
 *
 * Antes, qualquer organização com `org:manage` reivindicava qualquer `phoneNumberId`, e quem
 * reivindicava primeiro recebia o webhook daquele número. Agora a conexão nasce PENDING (não
 * recebe webhook) e só vira VERIFIED quando o número é conferido na Graph API com o token da
 * conta do WhatsApp Business da própria imobiliária. A reivindicação pendente tem prazo: vencida,
 * pode ser tomada por outra organização, mas só por quem provar a posse do número.
 */
export const WHATSAPP_CONNECTION_STATUSES = ['PENDING', 'VERIFIED', 'DISABLED'] as const;
export type WhatsAppConnectionStatus = (typeof WHATSAPP_CONNECTION_STATUSES)[number];

/** Prazo da reivindicação pendente: 24 horas. */
export const WHATSAPP_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

export function isWhatsAppConnectionStatus(value: string): value is WhatsAppConnectionStatus {
  return (WHATSAPP_CONNECTION_STATUSES as readonly string[]).includes(value);
}

export function whatsappClaimExpiresAt(now: Date): Date {
  return new Date(now.getTime() + WHATSAPP_CLAIM_TTL_MS);
}

/** Só o número com posse comprovada recebe as mensagens do webhook. */
export function canReceiveWhatsAppWebhook(status: string): boolean {
  return status === 'VERIFIED';
}

/** Só a reivindicação pendente passa pela verificação. */
export function canVerifyWhatsAppConnection(status: string): boolean {
  return status === 'PENDING';
}

export interface WhatsAppClaimHolder {
  orgId: string;
  status: string;
  claimExpiresAt: Date | null;
}

/** Reivindicação pendente vencida (sem prazo gravado conta como vencida). */
export function isWhatsAppClaimExpired(holder: WhatsAppClaimHolder, now: Date): boolean {
  if (holder.status !== 'PENDING') {
    return false;
  }
  return holder.claimExpiresAt === null || holder.claimExpiresAt.getTime() <= now.getTime();
}

export type WhatsAppClaimConflict =
  'VERIFIED_HERE' | 'VERIFIED_ELSEWHERE' | 'PENDING_ELSEWHERE' | 'DISABLED_ELSEWHERE';

export type WhatsAppClaimDecision =
  | { kind: 'CREATE' }
  | { kind: 'RENEW_OWN' }
  | { kind: 'TAKE_OVER_EXPIRED' }
  | { kind: 'CONFLICT'; reason: WhatsAppClaimConflict };

/**
 * Quem pode reivindicar o número:
 * - número livre → cria a reivindicação (PENDING);
 * - reivindicação pendente ou desativada da própria organização → troca o token e renova o prazo;
 * - número verificado → conflito, para a própria organização e para as outras;
 * - reivindicação pendente de outra organização no prazo → conflito;
 * - reivindicação pendente de outra organização vencida → tomada, exigindo prova de posse;
 * - número desativado em outra organização → conflito.
 */
export function decideWhatsAppClaim(
  holder: WhatsAppClaimHolder | null,
  claimantOrgId: string,
  now: Date,
): WhatsAppClaimDecision {
  if (!holder) {
    return { kind: 'CREATE' };
  }
  const own = holder.orgId === claimantOrgId;
  if (holder.status === 'VERIFIED') {
    return { kind: 'CONFLICT', reason: own ? 'VERIFIED_HERE' : 'VERIFIED_ELSEWHERE' };
  }
  if (own) {
    return { kind: 'RENEW_OWN' };
  }
  if (holder.status === 'PENDING') {
    return isWhatsAppClaimExpired(holder, now)
      ? { kind: 'TAKE_OVER_EXPIRED' }
      : { kind: 'CONFLICT', reason: 'PENDING_ELSEWHERE' };
  }
  return { kind: 'CONFLICT', reason: 'DISABLED_ELSEWHERE' };
}
