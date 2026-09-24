import { and, eq, isNull } from 'drizzle-orm';
import { auditEvents, users, userSessions } from '@aluguei/db';
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

/**
 * Redefine a senha de um admin da plataforma pelo servidor.
 *
 * Existe porque o admin não tem outra porta: o cadastro aberto recusa os e-mails da
 * allowlist, e a recuperação por link depende de e-mail, que nenhum ambiente envia — a
 * mensagem só é gravada na caixa de saída local. Sem isto, admin sem senha é admin sem
 * acesso, com o banco como único recurso.
 *
 * **Todas as sessões caem**, como na redefinição por link: quem redefine senha pelo
 * servidor não sabe quais sessões abertas ainda são legítimas.
 */
export async function resetPlatformAdminPassword(
  db: AppDb,
  allowlist: ReadonlySet<string>,
  input: { email: string; password: string },
): Promise<{ revokedSessions: number }> {
  const email = normalizeEmail(input.email);
  if (!isPlatformAdminEmail(allowlist, email)) {
    throw new DomainError('FORBIDDEN', 'E-mail fora de PLATFORM_ADMIN_EMAILS');
  }
  if (input.password.length < PLATFORM_ADMIN_MIN_PASSWORD) {
    throw new DomainError(
      'INVALID_INPUT',
      `A senha precisa de pelo menos ${String(PLATFORM_ADMIN_MIN_PASSWORD)} caracteres`,
    );
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    throw new DomainError('NOT_FOUND', 'Conta não encontrada para este e-mail');
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
    const sessoes = await tx
      .update(userSessions)
      .set({ revokedAt: now })
      .where(and(eq(userSessions.userId, user.id), isNull(userSessions.revokedAt)))
      .returning({ id: userSessions.id });
    await tx.insert(auditEvents).values({
      orgId: null,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.PLATFORM_ADMIN_PASSWORD_RESET,
      entityType: 'USER',
      entityId: user.id,
      payload: { email, revokedSessions: sessoes.length },
    });
    return { revokedSessions: sessoes.length };
  });
}
