import { hash, hashSync, verify, verifySync } from '@node-rs/argon2';

/** Parâmetros argon2id (OWASP recomendação de 2026 para CPU comum). */
export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** Gera hash argon2id de senha. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Gera hash argon2id síncrono (uso pontual: dummy hash p/ timing uniforme). */
export function hashPasswordSync(password: string): string {
  return hashSync(password, ARGON2_OPTIONS);
}

/** Verifica senha contra hash argon2id. */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

/** Verificação síncrona (ex.: testes de unidade). */
export function verifyPasswordSync(passwordHash: string, password: string): boolean {
  return verifySync(passwordHash, password);
}
