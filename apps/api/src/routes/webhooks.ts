import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  charges,
  webhookInbox,
  whatsappConnections,
  signatureEnvelopes,
  metaAssets,
  metaWebhookEvents,
} from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import { writeAudit } from '../plugins/audit.js';
import {
  metaWebhookEventSchema,
  paymentWebhookEventSchema,
  signatureWebhookEventSchema,
} from '@aluguei/contracts';
import type { VerifyWebhookParams } from '@aluguei/integrations';

/** body cru capturado no preParsing (necessário para validar X-Hub-Signature-256). */
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

/** Valida X-Hub-Signature-256 do payload bruto (comparação em tempo constante). */
function isValidHubSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.startsWith('sha256=')) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const presented = signature.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(presented, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook do WhatsApp (público, sem sessão). Valida → deduplica → enfileira
 * no webhook_inbox e responde 200 imediatamente (processamento assíncrono).
 * Autenticidade: X-Hub-Signature-256 exigida quando META_APP_SECRET configurado
 * (P1 da auditoria final); sem secret, a segurança vem do verify token.
 */
export const webhookRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  // Captura o raw body do webhook WhatsApp antes do parse JSON.
  // preParsing deve retornar um Stream (Buffer direto trava o parser).
  app.addHook('preParsing', async (request, _reply, payload) => {
    if (request.url === '/webhooks/whatsapp') {
      const chunks: Buffer[] = [];
      for await (const chunk of payload) {
        chunks.push(
          typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array),
        );
      }
      request.rawBody = Buffer.concat(chunks);
      return Readable.from([request.rawBody]);
    }
  });

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
      // Autenticidade (P1): X-Hub-Signature-256 exigida quando META_APP_SECRET
      // está configurado. Sem secret configurado (dev/dry-run), aceita — mas
      // produção DEVE configurar o secret (docs/THREAT_MODEL.md).
      const appSecret = process.env.META_APP_SECRET;
      if (appSecret) {
        const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
        if (
          !isValidHubSignature(
            rawBody,
            request.headers['x-hub-signature-256'] as string | undefined,
            appSecret,
          )
        ) {
          app.log.warn('whatsapp webhook: assinatura X-Hub-Signature-256 inválida');
          return reply.status(401).send({ error: 'Unauthorized' });
        }
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
      // Autenticidade (P1): quando ASAAS_WEBHOOK_TOKEN está configurado, o
      // provider real envia o token no header `asaas-webhook-token`. Sem o
      // token esperado → 401 (nunca enfileira). Em dev (provider FAKE sem
      // token), a segurança vem da confirmação no provider feita pelo worker.
      const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
      const presentedToken = request.headers['asaas-webhook-token'];
      if (expectedToken && presentedToken !== expectedToken) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      // Resolve org por provider_charge_id (não confia em org_id do payload).
      const [charge] = await db
        .select({ orgId: charges.orgId, providerChargeId: charges.providerChargeId })
        .from(charges)
        .where(eq(charges.providerChargeId, input.providerChargeId))
        .limit(1);
      if (!charge) {
        return reply.status(200).send({ status: 'ignored' });
      }
      // Em modo FAKE, o webhook confirma a cobrança no provider para que o
      // worker (que SEMPRE confirma via getChargeStatus) possa creditar.
      const provider = app.payments;
      if (provider?.confirmCharge && charge.providerChargeId) {
        await provider.confirmCharge(charge.providerChargeId);
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

  app.get('/webhooks/meta', async (request, reply) => {
    const query = request.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (
      query['hub.mode'] !== 'subscribe' ||
      !verifyToken ||
      query['hub.verify_token'] !== verifyToken
    ) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    return reply.type('text/plain').send(query['hub.challenge'] ?? '');
  });

  app.post(
    '/webhooks/meta',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = metaWebhookEventSchema.parse(request.body);

      // Resolve org pelo ad account (não confia em org_id do payload).
      let orgId: string | null = null;
      if (input.adAccountId) {
        const [asset] = await db
          .select({ orgId: metaAssets.orgId })
          .from(metaAssets)
          .where(
            and(
              eq(metaAssets.kind, 'AD_ACCOUNT'),
              eq(metaAssets.providerAssetId, input.adAccountId),
            ),
          )
          .limit(1);
        orgId = asset?.orgId ?? null;
      }
      if (!orgId) {
        return reply.status(200).send({ status: 'ignored' });
      }

      // Arquiva (dedup por provider_event_id UNIQUE) + enfileira no inbox.
      await db
        .insert(metaWebhookEvents)
        .values({
          orgId,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          payload: { ...input } as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing();
      await db
        .insert(webhookInbox)
        .values({
          orgId,
          provider: 'META',
          providerEventId: `META:${input.providerEventId}`,
          payload: { ...input } as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing();
      await writeAudit(db, {
        orgId,
        action: AUDIT_ACTIONS.META_WEBHOOK_RECEIVED,
        entityType: 'WEBHOOK',
        entityId: 'meta',
        payload: { eventType: input.eventType },
      });
      return reply.status(200).send({ status: 'queued' });
    },
  );

  return Promise.resolve();
};
