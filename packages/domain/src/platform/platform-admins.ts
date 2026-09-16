import { normalizeEmail } from '../values/identifiers.js';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admins da plataforma vêm da variável `PLATFORM_ADMIN_EMAILS` (vírgula, ponto e
 * vírgula ou espaço). Ausente ou vazia: ninguém é admin. A conta é criada por
 * quem opera o servidor; o cadastro aberto recusa esses e-mails.
 */
export function parsePlatformAdminEmails(raw: string | undefined): ReadonlySet<string> {
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((entry) => normalizeEmail(entry))
      .filter((entry) => EMAIL_SHAPE.test(entry)),
  );
}

export function isPlatformAdminEmail(allowlist: ReadonlySet<string>, email: string): boolean {
  return allowlist.has(normalizeEmail(email));
}
