import { createHash, randomBytes } from 'node:crypto';
import type { DbExecutor } from '@aluguei/db';
import { emailOutbox } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import { writeAudit } from './plugins/audit.js';

/**
 * Caixa de saída local de e-mail (auditoria 2026-09-10, trilha D). **Nada é enviado**: não há
 * provider de e-mail no produto, e a recuperação de senha e o convite de membro gravam a mensagem
 * aqui. A leitura é por rota protegida (`GET /email-outbox`, permissão `org:manage`), e a mensagem
 * de senha nasce sem organização — nunca aparece para o administrador de nenhuma imobiliária.
 * A confirmação do alerta de imóvel (portal) segue a mesma regra: sem organização, porque o
 * contato de quem procura imóvel não pertence a nenhuma imobiliária.
 */

export type OutboxKind = 'PASSWORD_RESET' | 'MEMBER_INVITE' | 'SEARCH_ALERT_CONFIRM';

export interface QueueEmailInput {
  /** Nulo para mensagem de conta (recuperação de senha): não pertence a nenhuma imobiliária. */
  orgId: string | null;
  kind: OutboxKind;
  toEmail: string;
  subject: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actorUserId?: string | null;
}

export async function queueEmail(db: DbExecutor, input: QueueEmailInput): Promise<string> {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      orgId: input.orgId,
      kind: input.kind,
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      status: 'QUEUED',
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    })
    .returning({ id: emailOutbox.id });
  const messageId = row?.id ?? '';
  await writeAudit(db, {
    orgId: input.orgId,
    actorUserId: input.actorUserId ?? null,
    action: AUDIT_ACTIONS.EMAIL_QUEUED,
    entityType: 'EMAIL',
    entityId: messageId,
    // O corpo tem o link com o token: nunca entra na auditoria.
    payload: { kind: input.kind, delivered: false },
  });
  return messageId;
}

/** Token opaco de uso único; o banco guarda só o hash. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
