/**
 * Regras da conta na interface (auditoria 2026-09-10, P2-04): troca e recuperação de senha e
 * convite de membro. Espelha packages/domain/src/auth/recovery.ts sem importar o pacote de
 * domínio no bundle do cliente; account-rules.test.ts compara com o domínio.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Senha nova com confirmação (recuperação e troca). */
export function newPasswordErrors(input: {
  password: string;
  confirm: string;
}): FieldErrors<'password' | 'confirm'> {
  const errors: FieldErrors<'password' | 'confirm'> = {};
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `A senha precisa ter de ${String(PASSWORD_MIN_LENGTH)} a ${String(PASSWORD_MAX_LENGTH)} caracteres`;
    return errors;
  }
  if (input.confirm !== input.password) {
    errors.confirm = 'A confirmação não confere';
  }
  return errors;
}

/** Troca de senha pela conta: exige a atual e uma nova diferente dela. */
export function changePasswordErrors(input: {
  current: string;
  password: string;
  confirm: string;
}): FieldErrors<'current' | 'password' | 'confirm'> {
  if (input.current === '') {
    return { current: 'Informe a senha atual' };
  }
  const errors = newPasswordErrors(input);
  if (Object.keys(errors).length > 0) {
    return errors;
  }
  if (input.password === input.current) {
    return { password: 'A senha nova precisa ser diferente da atual' };
  }
  return {};
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** Convite de membro: e-mail e função. */
export function inviteErrors(input: {
  email: string;
  role: string;
}): FieldErrors<'email' | 'role'> {
  const email = input.email.trim();
  if (email === '') {
    return { email: 'Informe o e-mail' };
  }
  if (!EMAIL_RE.test(email.toLowerCase())) {
    return { email: 'E-mail inválido' };
  }
  if (input.role === '') {
    return { role: 'Escolha a função' };
  }
  return {};
}

export const INVITE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceito',
  REVOKED: 'Revogado',
  EXPIRED: 'Expirado',
};

/** "1 outra sessão encerrada", "2 outras sessões encerradas", ou nada. */
export function revokedSessionsText(count: number): string {
  if (count <= 0) {
    return 'Nenhuma outra sessão estava aberta';
  }
  return count === 1 ? '1 outra sessão encerrada' : `${String(count)} outras sessões encerradas`;
}
