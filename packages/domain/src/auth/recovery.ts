import { DomainError } from '../errors.js';

/**
 * Regras do token de uso único da recuperação de senha e do convite de membro
 * (auditoria 2026-09-10, P2-04). O token em si nunca é guardado: o banco guarda
 * só o hash (ver `hashOpaqueToken` na API).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Recuperação de senha: janela curta. */
export const PASSWORD_RESET_TTL_MINUTES = 30;
/** Convite de membro: três dias, tempo de a pessoa abrir o e-mail. */
export const MEMBER_INVITE_TTL_HOURS = 72;

export interface OneTimeToken {
  expiresAt: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}

/** Instante de expiração a partir de `now`. */
export function expiresAt(now: Date, ttl: { minutes?: number; hours?: number }): Date {
  const minutes = (ttl.minutes ?? 0) + (ttl.hours ?? 0) * 60;
  return new Date(now.getTime() + minutes * 60_000);
}

/** Token serve enquanto não venceu, não foi usado e não foi revogado. */
export function tokenUsable(token: OneTimeToken, now: Date): boolean {
  if (token.usedAt) {
    return false;
  }
  if (token.revokedAt) {
    return false;
  }
  return token.expiresAt.getTime() > now.getTime();
}

/**
 * Token inválido responde NOT_FOUND com a mesma mensagem do token inexistente — nunca revela se
 * ele existiu, venceu ou já foi usado.
 */
export function assertTokenUsable(token: OneTimeToken, now: Date, message: string): void {
  if (!tokenUsable(token, now)) {
    throw new DomainError('NOT_FOUND', message);
  }
}

/** Senha nova: tamanho mínimo e diferente da atual. */
export function assertNewPassword(password: string, ctx: { sameAsCurrent: boolean }): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new DomainError(
      'INVALID_INPUT',
      `A senha precisa ter de ${String(PASSWORD_MIN_LENGTH)} a ${String(PASSWORD_MAX_LENGTH)} caracteres`,
    );
  }
  if (ctx.sameAsCurrent) {
    throw new DomainError('INVALID_INPUT', 'A senha nova precisa ser diferente da atual');
  }
}
