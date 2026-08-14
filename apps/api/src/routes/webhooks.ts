import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { charges, webhookInbox, whatsappConnections, signatureEnvelopes } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import { writeAudit } from '../plugins/audit.js';
import { paymentWebhookEventSchema, signatureWebhookEventSchema } from '@aluguei/contracts';
import type { VerifyWebhookParams } from '@aluguei/integrations';

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

  app.post(
    '/webhooks/signature',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = signatureWebhookEventSchema.parse(request.body);
      // Resolve envelope da org (não confia em org_id do payload).
      const [envelope] = await db
        .select()
        .from(signatureEnvelopes)
        .where(
          and(
            eq(signatureEnvelopes.provider, input.provider),
            eq(signatureEnvelopes.providerEnvelopeId, input.providerEnvelopeId),
          ),
        )
        .limit(1);
      if (!envelope) {
        // Envelope desconhecido: ignora (200) — não gera retry infinito do provider.
        return reply.status(200).send({ status: 'ignored' });
      }
      // Dedup por UNIQUE(provider, provider_event_id).
      await db
        .insert(webhookInbox)
        .values({
          orgId: envelope.orgId,
          provider: 'SIGNATURE',
          providerEventId: `${input.provider}:${input.providerEventId}`,
          payload: { envelopeId: envelope.id, ...input },
        })
        .onConflictDoNothing();
      await writeAudit(db, {
        action: AUDIT_ACTIONS.SIGNATURE_WEBHOOK_RECEIVED,
        entityType: 'WEBHOOK',
        entityId: 'signature',
        payload: { envelopeId: envelope.id, eventType: input.eventType },
      });
      return reply.status(200).send({ status: 'queued' });
    },
  );

  app.post(
    '/webhooks/payments',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = paymentWebhookEventSchema.parse(request.body);
      // Resolve org por provider_charge_id (não confia em org_id do payload).
      const [charge] = await db
        .select({ orgId: charges.orgId })
        .from(charges)
        .where(eq(charges.providerChargeId, input.providerChargeId))
        .limit(1);
      if (!charge) {
        return reply.status(200).send({ status: 'ignored' });
      }
      await db
        .insert(webhookInbox)
        .values({
          orgId: charge.orgId,
          provider: 'PAYMENT',
          providerEventId: `PAY:${input.providerEventId}`,
          payload: { ...input } as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing();
      return reply.status(200).send({ status: 'queued' });
    },
  );

  return Promise.resolve();
};
