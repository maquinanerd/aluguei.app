import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password (argon2id)', () => {
  it('hash e verify com senha correta', async () => {
    const hashed = await hashPassword('senha-segura-123');
    expect(hashed).not.toBe('senha-segura-123');
    await expect(verifyPassword(hashed, 'senha-segura-123')).resolves.toBe(true);
  });

  it('rejeita senha incorreta', async () => {
    const hashed = await hashPassword('senha-segura-123');
    await expect(verifyPassword(hashed, 'outra-senha')).resolves.toBe(false);
  });
});
