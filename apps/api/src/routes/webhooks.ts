import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { webhookInbox, whatsappConnections } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import type { VerifyWebhookParams } from '@aluguei/integrations';
import { writeAudit } from '../plugins/audit.js';

/**
 * Webhook do WhatsApp (público, sem sessão). Valida → deduplica → enfileira
 * no webhook_inbox e responde 200 imediatamente (processamento assíncrono).
 */
export const webhookRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
    const messenger = app.whatsapp;
    if (!messenger) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const params: VerifyWebhookParams = {};
    if (query['hub.mode'] !== undefined) {
      params.mode = query['hub.mode'];
    }
    if (query['hub.verify_token'] !== undefined) {
      params.token = query['hub.verify_token'];
    }
    if (query['hub.challenge'] !== undefined) {
      params.challenge = query['hub.challenge'];
    }
    const result = messenger.verifyWebhook(params);
    if (!result.valid) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    return reply.type('text/plain').send(result.challenge ?? '');
  });

  app.post(
    '/webhooks/whatsapp',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const messenger = app.whatsapp;
      if (!messenger) {
        return reply.status(200).send({ status: 'ignored' });
      }
      const events = messenger.parseWebhookEvent(request.body);
      if (events.length === 0) {
        return reply.status(200).send({ status: 'no-messages' });
      }

      for (const event of events) {
        // Resolve org pelo phone_number_id (o webhook não carrega org_id).
        const [connection] = await db
          .select()
          .from(whatsappConnections)
          .where(
            and(
              eq(whatsappConnections.phoneNumberId, event.phoneNumberId),
              eq(whatsappConnections.status, 'ACTIVE'),
            ),
          )
          .limit(1);
        if (!connection) {
          // Sem conexão → ignora com 200 (evita retry infinito da Meta).
          app.log.info(
            { phoneNumberId: event.phoneNumberId },
            'whatsapp webhook sem conexão de org',
          );
          continue;
        }
        // Dedup: UNIQUE (provider, provider_event_id) + ON CONFLICT DO NOTHING.
        await db
          .insert(webhookInbox)
          .values({
            orgId: connection.orgId,
            provider: 'WHATSAPP',
            providerEventId: event.waMessageId,
            payload: event as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing();
      }

      await writeAudit(db, {
        action: AUDIT_ACTIONS.WHATSAPP_WEBHOOK_RECEIVED,
        entityType: 'WEBHOOK',
        entityId: 'whatsapp',
        payload: { events: events.length },
      });

      return reply.status(200).send({ status: 'queued' });
    },
  );

  return Promise.resolve();
};
