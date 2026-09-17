import type { BadgeTone } from '@aluguei/ui';

/**
 * Acesso ao portal do inquilino e do proprietário pela interface (auditoria 2026-09-10,
 * P1-16): link de entrada, situação da concessão e mensagens do consumo do token.
 * Módulo puro.
 */

export type PortalKind = 'TENANT' | 'LANDLORD';

export interface PortalAccessSummary {
  id: string;
  partyId: string;
  kind: PortalKind;
  createdAt: string;
  revokedAt: string | null;
  linkActive: boolean;
  linkExpiresAt: string | null;
  activeSessions: number;
}

export const PORTAL_ENTRY_PATH = '/portal/entrar';

/** Link que a pessoa abre: o token vai na query e a página o remove da barra de endereço. */
export function portalEntryLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${PORTAL_ENTRY_PATH}?token=${encodeURIComponent(token)}`;
}

export function portalDestination(kind: PortalKind): string {
  return kind === 'TENANT' ? '/inquilino' : '/proprietario';
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Situação mostrada na tela de concessão. */
export function portalAccessState(access: PortalAccessSummary): { label: string; tone: BadgeTone } {
  if (access.revokedAt !== null) {
    return { label: 'Acesso revogado', tone: 'neutral' };
  }
  if (access.linkActive) {
    return {
      label: access.linkExpiresAt
        ? `Link ainda não usado · vale até ${formatDay(access.linkExpiresAt)}`
        : 'Link ainda não usado',
      tone: 'warning',
    };
  }
  return { label: 'Link já usado', tone: 'success' };
}

/** Mensagem para a resposta do consumo do token na página de entrada. */
export function consumeErrorMessage(status: number): string {
  switch (status) {
    case 400:
    case 401:
      return 'Este link de acesso é inválido, expirou ou já foi usado. Peça um novo link à imobiliária.';
    case 403:
      return 'O acesso ao portal desta imobiliária está suspenso.';
    case 429:
      return 'Muitas tentativas seguidas. Aguarde um minuto e abra o link de novo.';
    default:
      return 'Não foi possível abrir o portal agora. Tente de novo em instantes.';
  }
}
