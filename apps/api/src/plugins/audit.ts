import type { AppDb } from '@aluguei/db';
import { auditEvents } from '@aluguei/db';

export interface AuditInput {
  orgId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}

/** Grava audit event com payload redactada de PII antes do jsonb. */
export async function writeAudit(db: AppDb, input: AuditInput): Promise<void> {
  const { orgId, actorUserId, action, entityType, entityId, payload } = input;

  // Redação preventiva: nunca persistir credenciais/segredos em audit.
  const safePayload: Record<string, unknown> = { ...(payload ?? {}) };
  for (const key of Object.keys(safePayload)) {
    if (/password|token|secret|authorization|api_?key/i.test(key)) {
      safePayload[key] = '[REDACTED]';
    }
  }

  await db.insert(auditEvents).values({
    orgId: orgId ?? null,
    actorUserId: actorUserId ?? null,
    action,
    entityType,
    entityId,
    payload: safePayload,
  });
}
