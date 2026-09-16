import { eq } from 'drizzle-orm';
import { auditEvents, users } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  hashPassword,
  isPlatformAdminEmail,
  normalizeEmail,
} from '@aluguei/domain';

/** Senha do admin da plataforma: mais longa que a do cadastro aberto (mínimo 8). */
export const PLATFORM_ADMIN_MIN_PASSWORD = 12;

/**
 * Cria a conta de um admin da plataforma — só pelo servidor, porque o cadastro aberto
 * recusa os e-mails da allowlist. Conta existente não é alterada (nem a senha): o
 * acesso de admin vem da allowlist, não da conta.
 */
export async function createPlatformAdminAccount(
  db: AppDb,
  allowlist: ReadonlySet<string>,
  input: { email: string; name: string; password: string },
): Promise<'CREATED' | 'EXISTS'> {
  const email = normalizeEmail(input.email);
  if (!isPlatformAdminEmail(allowlist, email)) {
    throw new DomainError('FORBIDDEN', 'E-mail fora de PLATFORM_ADMIN_EMAILS');
  }
  const name = input.name.trim();
  if (name === '') {
    throw new DomainError('INVALID_INPUT', 'Informe o nome');
  }
  if (input.password.length < PLATFORM_ADMIN_MIN_PASSWORD) {
    throw new DomainError(
      'INVALID_INPUT',
      `A senha precisa de pelo menos ${String(PLATFORM_ADMIN_MIN_PASSWORD)} caracteres`,
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return 'EXISTS';
  }

  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email, name, passwordHash }).returning();
    if (!user) {
      throw new Error('conta do admin não gravada');
    }
    await tx.insert(auditEvents).values({
      orgId: null,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.PLATFORM_ADMIN_BOOTSTRAPPED,
      entityType: 'USER',
      entityId: user.id,
      payload: { email },
    });
  });
  return 'CREATED';
}
