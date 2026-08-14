import { metaAuditEvents } from '@aluguei/db';
import { digestInput } from '@aluguei/config';
import type { AppDb } from '@aluguei/db';

/** Registra chamada de tool no meta_audit_events (sem PII — digest do input). */
export async function recordToolCall(
  db: AppDb,
  input: {
    orgId: string;
    tool: string;
    action: string;
    idempotencyKey?: string | null;
    inputRaw?: string;
    status: 'SUCCESS' | 'ERROR';
    error?: string | null;
  },
): Promise<void> {
  await db.insert(metaAuditEvents).values({
    orgId: input.orgId,
    tool: input.tool,
    action: input.action,
    idempotencyKey: input.idempotencyKey ?? null,
    inputDigest: input.inputRaw ? digestInput(input.inputRaw) : null,
    status: input.status,
    error: input.error
      ? input.error
          .replace(/https?:\/\/[^\s]+/g, '[url]')
          .replace(/\bEAAG[0-9A-Za-z_-]{10,}/g, '[token]')
          .slice(0, 500)
      : null,
  });
}
