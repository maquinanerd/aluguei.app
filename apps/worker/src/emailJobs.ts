import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { emailOutbox } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import { EmailProviderError } from '@aluguei/integrations';
import type { IEmailSender } from '@aluguei/integrations';
import { writeAudit } from '@aluguei/api/audit';
import { startJobLog } from './job-log.js';
import type { JobLogger } from './job-log.js';

/** Tentativas antes de desistir da mensagem (FAILED). */
export const EMAIL_MAX_ATTEMPTS = 5;

/** Espera até a próxima tentativa, pela tentativa que falhou: 1 min, 5 min, 15 min e 1 h. */
const ESPERAS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function esperaDepoisDe(tentativa: number): number {
  return ESPERAS_MS[Math.min(tentativa, ESPERAS_MS.length) - 1] ?? 60_000;
}

/** Motivo curto para `last_error` e para o log: sem link (o corpo tem token) e sem endereço. */
function motivoDe(err: unknown): string {
  const texto = err instanceof Error ? err.message : 'erro desconhecido na entrega';
  return texto
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/[^\s@<>]+@[^\s@<>]+/g, '[e-mail]')
    .slice(0, 300);
}

export interface RunEmailOutboxOptions {
  db: AppDb;
  /** Sem provedor, nada sai: a mensagem fica na caixa de saída, como antes (D6). */
  sender: IEmailSender | null;
  limit?: number;
  now?: () => Date;
  log?: (msg: string) => void;
  logger?: JobLogger;
}

/**
 * Entrega da caixa de saída de e-mail (B28, D6 b): o que está `QUEUED` e já pode ser tentado vai
 * para o provedor. Deu certo, `SENT` com o id do provedor; falha que vale repetir (limite,
 * instabilidade, tempo esgotado) volta para a fila com espera crescente, até 5 tentativas; recusa
 * do provedor (chave, mensagem inválida) vira `FAILED` na hora. A chave de idempotência é o id da
 * mensagem, então repetir depois de um tempo esgotado não manda duas vezes. Nem o corpo (o link tem
 * token) nem o destinatário vão para a auditoria.
 */
export async function runEmailOutbox(opts: RunEmailOutboxOptions): Promise<{ processed: number }> {
  const { db, sender } = opts;
  if (!sender) {
    return { processed: 0 };
  }
  const agora = (opts.now ?? (() => new Date()))();
  const pendentes = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, 'QUEUED'),
        or(isNull(emailOutbox.nextAttemptAt), lte(emailOutbox.nextAttemptAt, agora)),
      ),
    )
    .orderBy(asc(emailOutbox.createdAt), asc(emailOutbox.id))
    .limit(opts.limit ?? 20);

  for (const mensagem of pendentes) {
    const tentativa = mensagem.attempts + 1;
    const jobLog = startJobLog(opts.logger, {
      queue: 'email',
      jobId: mensagem.id,
      jobType: `${sender.provider}:${mensagem.kind}`,
      attempt: tentativa,
      orgId: mensagem.orgId,
    });
    try {
      const { providerMessageId } = await sender.send({
        id: mensagem.id,
        to: mensagem.toEmail,
        subject: mensagem.subject,
        text: mensagem.body,
      });
      await db.transaction(async (tx) => {
        // Compare-and-set: uma passada que já entregou esta mensagem não é sobrescrita.
        const [entregue] = await tx
          .update(emailOutbox)
          .set({
            status: 'SENT',
            sentAt: agora,
            attempts: tentativa,
            lastError: null,
            nextAttemptAt: null,
            providerMessageId,
          })
          .where(and(eq(emailOutbox.id, mensagem.id), eq(emailOutbox.status, 'QUEUED')))
          .returning({ id: emailOutbox.id });
        if (entregue) {
          await writeAudit(tx, {
            orgId: mensagem.orgId,
            actorUserId: null,
            action: AUDIT_ACTIONS.EMAIL_SENT,
            entityType: 'EMAIL',
            entityId: mensagem.id,
            payload: { kind: mensagem.kind, provider: sender.provider, attempts: tentativa },
          });
        }
      });
      jobLog.finished('SENT');
    } catch (err) {
      const motivo = motivoDe(err);
      // Erro fora do provedor (rede, bug) também merece nova tentativa; recusa do provedor, não.
      const repetir = !(err instanceof EmailProviderError) || err.retryable;
      const desistir = !repetir || tentativa >= EMAIL_MAX_ATTEMPTS;
      await db.transaction(async (tx) => {
        const [anotada] = await tx
          .update(emailOutbox)
          .set({
            status: desistir ? 'FAILED' : 'QUEUED',
            attempts: tentativa,
            lastError: motivo,
            nextAttemptAt: desistir ? null : new Date(agora.getTime() + esperaDepoisDe(tentativa)),
          })
          .where(and(eq(emailOutbox.id, mensagem.id), eq(emailOutbox.status, 'QUEUED')))
          .returning({ id: emailOutbox.id });
        if (anotada && desistir) {
          await writeAudit(tx, {
            orgId: mensagem.orgId,
            actorUserId: null,
            action: AUDIT_ACTIONS.EMAIL_FAILED,
            entityType: 'EMAIL',
            entityId: mensagem.id,
            payload: {
              kind: mensagem.kind,
              provider: sender.provider,
              attempts: tentativa,
              code: err instanceof EmailProviderError ? err.code : 'UNKNOWN',
            },
          });
        }
      });
      jobLog.failed(desistir ? 'FAILED' : 'RETRY', motivo, err);
      opts.log?.(
        `e-mail ${mensagem.id} (${mensagem.kind}) ${desistir ? 'FAILED' : 'RETRY'}: ${motivo}`,
      );
    }
  }
  return { processed: pendentes.length };
}
