import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  assertNewPassword,
  assertTokenUsable,
  expiresAt,
  MEMBER_INVITE_TTL_HOURS,
  PASSWORD_RESET_TTL_MINUTES,
  tokenUsable,
} from './recovery.js';

const now = new Date('2026-09-17T12:00:00.000Z');

describe('token de uso único (recuperação de senha e convite de membro)', () => {
  it('a validade é curta para senha e de dias para convite', () => {
    expect(PASSWORD_RESET_TTL_MINUTES).toBe(30);
    expect(MEMBER_INVITE_TTL_HOURS).toBe(72);
    expect(expiresAt(now, { minutes: PASSWORD_RESET_TTL_MINUTES }).toISOString()).toBe(
      '2026-09-17T12:30:00.000Z',
    );
    expect(expiresAt(now, { hours: MEMBER_INVITE_TTL_HOURS }).toISOString()).toBe(
      '2026-09-20T12:00:00.000Z',
    );
  });

  it('serve enquanto não vence, não foi usado e não foi revogado', () => {
    expect(tokenUsable({ expiresAt: new Date('2026-09-17T12:00:01.000Z') }, now)).toBe(true);
    expect(tokenUsable({ expiresAt: new Date('2026-09-17T11:59:59.000Z') }, now)).toBe(false);
    expect(
      tokenUsable(
        { expiresAt: new Date('2026-09-17T12:30:00.000Z'), usedAt: new Date('2026-09-17T12:01:00.000Z') },
        now,
      ),
    ).toBe(false);
    expect(
      tokenUsable(
        {
          expiresAt: new Date('2026-09-17T12:30:00.000Z'),
          revokedAt: new Date('2026-09-17T12:01:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('token vencido, usado ou revogado responde NOT_FOUND (sem oráculo de existência)', () => {
    let error: unknown;
    try {
      assertTokenUsable({ expiresAt: new Date('2026-09-17T11:00:00.000Z') }, now, 'Convite inválido');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('NOT_FOUND');
    expect((error as DomainError).message).toBe('Convite inválido');
  });
});

describe('senha nova', () => {
  it('exige o mínimo de caracteres', () => {
    expect(() => {
      assertNewPassword('senha-longa-o-bastante', { sameAsCurrent: false });
    }).not.toThrow();
    for (const weak of ['', 'curta', '1234567']) {
      let error: unknown;
      try {
        assertNewPassword(weak, { sameAsCurrent: false });
      } catch (err) {
        error = err;
      }
      expect(error, JSON.stringify(weak)).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_INPUT');
    }
  });

  it('recusa senha igual à atual', () => {
    let error: unknown;
    try {
      assertNewPassword('senha-segura-123', { sameAsCurrent: true });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('INVALID_INPUT');
  });
});
