import { describe, expect, it } from 'vitest';
import { isPlatformAdminEmail, parsePlatformAdminEmails } from './platform-admins.js';

describe('allowlist de admins da plataforma', () => {
  it('aceita vírgula, ponto e vírgula e espaços; normaliza caixa e espaços', () => {
    const allowlist = parsePlatformAdminEmails(' Ana@Exemplo.com,bruno@exemplo.com; carla@exemplo.com\n');
    expect([...allowlist].sort()).toEqual([
      'ana@exemplo.com',
      'bruno@exemplo.com',
      'carla@exemplo.com',
    ]);
    expect(isPlatformAdminEmail(allowlist, '  ANA@exemplo.com ')).toBe(true);
    expect(isPlatformAdminEmail(allowlist, 'daniel@exemplo.com')).toBe(false);
  });

  it('variável ausente ou vazia não dá acesso a ninguém', () => {
    expect(parsePlatformAdminEmails(undefined).size).toBe(0);
    expect(parsePlatformAdminEmails('  , ; ').size).toBe(0);
    expect(isPlatformAdminEmail(parsePlatformAdminEmails(''), '')).toBe(false);
  });

  it('ignora entradas que não são e-mail', () => {
    expect([...parsePlatformAdminEmails('admin, @exemplo.com, ana@exemplo.com, ana@')]).toEqual([
      'ana@exemplo.com',
    ]);
  });
});
