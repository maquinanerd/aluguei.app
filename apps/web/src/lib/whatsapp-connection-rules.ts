/**
 * Conexão do número do WhatsApp na tela de integrações (auditoria 2026-09-10, P1-18, segunda
 * parte). Espelha packages/domain/src/whatsapp/connection.ts e o contrato
 * `createWhatsAppConnectionRequestSchema` sem importar os pacotes no bundle do cliente;
 * whatsapp-connection-rules.test.ts compara com o domínio e com o contrato.
 */
import type { FieldErrors } from './account-rules';

export const WHATSAPP_CONNECTION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando verificação',
  VERIFIED: 'Verificada',
  DISABLED: 'Desativada',
};

export interface WhatsAppConnectionActions {
  /** Registrar um número (só quando a organização ainda não tem conexão). */
  connect: boolean;
  /** Conferir a posse do número com o token guardado. */
  verify: boolean;
  /** Informar outro token (reivindicação pendente ou desativada da própria organização). */
  replaceToken: boolean;
  /** O webhook entrega as mensagens do número a esta organização. */
  receivesMessages: boolean;
}

export function whatsappConnectionActions(
  connection: { status: string } | null,
): WhatsAppConnectionActions {
  if (!connection) {
    return { connect: true, verify: false, replaceToken: false, receivesMessages: false };
  }
  const { status } = connection;
  return {
    connect: false,
    verify: status === 'PENDING',
    replaceToken: status === 'PENDING' || status === 'DISABLED',
    receivesMessages: status === 'VERIFIED',
  };
}

/** Reivindicação pendente vencida (sem prazo conta como vencida), como no domínio. */
export function claimExpired(status: string, claimExpiresAt: string | null, now: Date): boolean {
  if (status !== 'PENDING') {
    return false;
  }
  return claimExpiresAt === null || new Date(claimExpiresAt).getTime() <= now.getTime();
}

const DIGITS_RE = /^[0-9]{1,32}$/;
export const WHATSAPP_TOKEN_MIN_LENGTH = 8;
export const WHATSAPP_TOKEN_MAX_LENGTH = 4096;

/** Formulário de conexão: o que a API recusaria, a tela recusa antes. */
export function connectWhatsAppErrors(input: {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
}): FieldErrors<'phoneNumberId' | 'businessAccountId' | 'accessToken'> {
  const errors: FieldErrors<'phoneNumberId' | 'businessAccountId' | 'accessToken'> = {};
  if (!DIGITS_RE.test(input.phoneNumberId.trim())) {
    errors.phoneNumberId = 'Informe o ID do número (só dígitos)';
  }
  const account = input.businessAccountId.trim();
  if (account !== '' && !DIGITS_RE.test(account)) {
    errors.businessAccountId = 'O ID da conta tem só dígitos';
  }
  const token = input.accessToken.trim();
  if (token.length < WHATSAPP_TOKEN_MIN_LENGTH || token.length > WHATSAPP_TOKEN_MAX_LENGTH) {
    errors.accessToken = 'Informe o token de acesso da conta';
  }
  return errors;
}

/** Token que o verificador FAKE aceita (só exibido quando a API informa verificador FAKE). */
export function fakeOwnerTokenHint(phoneNumberId: string): string {
  return `fake-wa-owner:${phoneNumberId.trim() === '' ? '<ID do número>' : phoneNumberId.trim()}`;
}
