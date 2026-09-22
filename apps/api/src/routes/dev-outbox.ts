import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { emailOutbox } from '@aluguei/db';
import { normalizeEmail } from '@aluguei/domain';
import { listEmailOutboxResponseSchema } from '@aluguei/contracts';

/**
 * Leitura da caixa de saída local por destinatário, para dev e E2E: a recuperação de senha começa
 * sem sessão, então nenhuma rota autenticada serve para abrir o link do teste. **Registrada apenas
 * fora de produção** (app.ts), como `/dev/fake-payments` — em produção a rota não existe.
 *
 * A mensagem da organização continua tendo a rota própria protegida (`GET /email-outbox`,
 * permissão `org:manage`). Nada é enviado em nenhum ambiente.
 */
export const devOutboxRoutes: FastifyPluginAsync = (app) => {
  app.get(
    '/dev/email-outbox',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const query = z
        .object({ to: z.email(), kind: z.enum(['PASSWORD_RESET', 'MEMBER_INVITE']).optional() })
        .strict()
        .parse(request.query);
      const rows = await app.db
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.toEmail, normalizeEmail(query.to)),
            query.kind ? eq(emailOutbox.kind, query.kind) : undefined,
          ),
        )
        .orderBy(desc(emailOutbox.createdAt))
        .limit(20);
      return listEmailOutboxResponseSchema.parse({
        messages: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          toEmail: row.toEmail,
          subject: row.subject,
          body: row.body,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    },
  );
  return Promise.resolve();
};
