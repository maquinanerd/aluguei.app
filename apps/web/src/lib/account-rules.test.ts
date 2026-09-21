import { describe, expect, it } from 'vitest';
import {
  assertNewPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH as DOMAIN_PASSWORD_MIN_LENGTH,
} from '@aluguei/domain';
import {
  changePasswordErrors,
  INVITE_STATUS_LABELS,
  inviteErrors,
  newPasswordErrors,
  PASSWORD_MIN_LENGTH,
} from './account-rules';

/**
 * G3, trilha D (auditoria 2026-09-10, P2-04): troca e recuperação de senha e convite de membro nas
 * telas. As regras espelham o domínio sem importá-lo no bundle do cliente.
 */
describe('senha nova na tela = domínio', () => {
  it('mesmo tamanho mínimo e máximo do domínio', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(DOMAIN_PASSWORD_MIN_LENGTH);
    for (const password of [
      '',
      'curta',
      '1234567',
      '12345678',
      'x'.repeat(PASSWORD_MAX_LENGTH),
      'x'.repeat(PASSWORD_MAX_LENGTH + 1),
    ]) {
      let domainAccepts = true;
      try {
        assertNewPassword(password, { sameAsCurrent: false });
      } catch {
        domainAccepts = false;
      }
      const errors = newPasswordErrors({ password, confirm: password });
      expect(errors.password === undefined, JSON.stringify(password.length)).toBe(domainAccepts);
    }
  });

  it('confirmação diferente e senha igual à atual', () => {
    expect(newPasswordErrors({ password: 'senha-nova-1', confirm: 'senha-nova-2' })).toEqual({
      confirm: 'A confirmação não confere',
    });
    expect(
      changePasswordErrors({
        current: 'senha-atual-1',
        password: 'senha-atual-1',
        confirm: 'senha-atual-1',
      }),
    ).toEqual({ password: 'A senha nova precisa ser diferente da atual' });
    expect(
      changePasswordErrors({ current: '', password: 'senha-nova-1', confirm: 'senha-nova-1' }),
    ).toEqual({ current: 'Informe a senha atual' });
    expect(
      changePasswordErrors({
        current: 'senha-atual-1',
        password: 'senha-nova-1',
        confirm: 'senha-nova-1',
      }),
    ).toEqual({});
  });
});

describe('convite de membro', () => {
  it('exige e-mail válido e função', () => {
    expect(inviteErrors({ email: '', role: 'agent' })).toEqual({ email: 'Informe o e-mail' });
    expect(inviteErrors({ email: 'sem-arroba', role: 'agent' })).toEqual({
      email: 'E-mail inválido',
    });
    expect(inviteErrors({ email: 'pessoa@exemplo.com', role: '' })).toEqual({
      role: 'Escolha a função',
    });
    expect(inviteErrors({ email: ' Pessoa@Exemplo.com ', role: 'viewer' })).toEqual({});
  });

  it('situação do convite em português', () => {
    expect(INVITE_STATUS_LABELS).toEqual({
      PENDING: 'Pendente',
      ACCEPTED: 'Aceito',
      REVOKED: 'Revogado',
      EXPIRED: 'Expirado',
    });
  });
});
