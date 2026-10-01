import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  webhookInbox,
  whatsappConnections,
  signatureEnvelopes,
  signatureEvents,
  metaAssets,
  metaWebhookEvents,
} from '@aluguei/db';
import { AUDIT_ACTIONS, canReceiveWhatsAppWebhook } from '@aluguei/domain';
import { findPaymentByProviderId } from '../finance/settlement.js';
import { writeAudit } from '../plugins/audit.js';
import {
  metaWebhookEventSchema,
  paymentWebhookEventSchema,
  signatureWebhookEventSchema,
} from '@aluguei/contracts';
import {
  AUTENTIQUE_SIGNATURE_HEADER,
  AutentiqueWebhookError,
  parseAutentiqueWebhook,
  verifyAutentiqueSignature,
} from '@aluguei/integrations';
import type { VerifyWebhookParams } from '@aluguei/integrations';

type SignatureWebhookEvent = ReturnType<typeof signatureWebhookEventSchema.parse>;
type SignatureEnvelopeRow = typeof signatureEnvelopes.$inferSelect;

/** Rotas cujo corpo cru é guardado antes do parse, para conferir a assinatura HMAC. */
const RAW_BODY_ROUTES: ReadonlySet<string> = new Set([
  '/webhooks/whatsapp',
  '/webhooks/meta',
  '/webhooks/signature/autentique',
]);

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

/** Compara token compartilhado em tempo constante (evita timing attack). */
function isValidSharedToken(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) {
    return false;
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extrai o token Bearer de `Authorization: Bearer <token>` (comparação constante). */
function bearerToken(header: string | string[] | undefined): string | undefined {
  if (Array.isArray(header)) {
    header = header[0];
  }
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice('Bearer '.length);
}

/**
 * Em produção os webhooks de assinatura e da Meta exigem credencial de
 * verificação configurada (SIGNATURE_WEBHOOK_TOKEN / META_APP_SECRET). Sem a
 * credencial, rejeita com 500 — sinal explícito de configuração incorreta
 * (o provider vê falha e não entrega eventos para um endpoint mal configurado).
 */
function enforceProductionSecret(
  request: { log: { error(msg: string): void } },
  reply: { status(code: number): unknown },
  env: { NODE_ENV?: string },
  secretConfigured: boolean,
  secretName: string,
): boolean {
  if (env.NODE_ENV === 'production' && !secretConfigured) {
    request.log.error(`webhook: ${secretName} ausente em produção`);
    reply.status(500);
    return true;
  }
  return false;
}

/**
 * Webhook do WhatsApp (público, sem sessão). Valida → deduplica → enfileira
 * no webhook_inbox e responde 200 imediatamente (processamento assíncrono).
 * Autenticidade: X-Hub-Signature-256 exigida quando META_APP_SECRET configurado
 * (P1 da auditoria final); sem secret, a segurança vem do verify token.
 */
export const webhookRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  // Captura o raw body dos webhooks assinados por HMAC (X-Hub-Signature-256 e
  // x-autentique-signature) antes do parse.
  // preParsing deve retornar um Stream (Buffer direto trava o parser).
  app.addHook('preParsing', async (request, _reply, payload) => {
    if (RAW_BODY_ROUTES.has(request.url.split('?')[0] ?? '')) {
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
      // está configurado. Em produção a configuração é OBRIGATÓRIA (500 se ausente).
      const appSecret = app.env.META_APP_SECRET;
      if (enforceProductionSecret(request, reply, app.env, Boolean(appSecret), 'META_APP_SECRET')) {
        return reply.send({ error: 'Server misconfigured' });
      }
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
          .where(eq(whatsappConnections.phoneNumberId, event.phoneNumberId))
          .limit(1);
        if (!connection) {
          // Sem conexão → ignora com 200 (evita retry infinito da Meta).
          app.log.info(
            { phoneNumberId: event.phoneNumberId },
            'whatsapp webhook sem conexão de org',
          );
          continue;
        }
        if (!canReceiveWhatsAppWebhook(connection.status)) {
          // Número só reivindicado (PENDING) ou desativado: a mensagem não vai para a organização
          // que reivindicou sem provar a posse (P1-18). Ignora com 200, sem gravar o conteúdo.
          app.log.info(
            { phoneNumberId: event.phoneNumberId, status: connection.status },
            'whatsapp webhook para número sem posse comprovada',
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
      // Autenticidade (P1): token compartilhado via `Authorization: Bearer`.
      // Em produção SIGNATURE_WEBHOOK_TOKEN é OBRIGATÓRIO; em dev/test sem token
      // configurado aceita (providers reais sempre enviam). O dedup por
      // provider_event_id e a resolução por envelope impedem envenenamento.
      const expectedToken = app.env.SIGNATURE_WEBHOOK_TOKEN;
      if (
        enforceProductionSecret(
          request,
          reply,
          app.env,
          Boolean(expectedToken),
          'SIGNATURE_WEBHOOK_TOKEN',
        )
      ) {
        return reply.send({ error: 'Server misconfigured' });
      }
      if (expectedToken) {
        const presented = bearerToken(request.headers.authorization);
        if (!isValidSharedToken(presented, expectedToken)) {
          app.log.warn('signature webhook: token inválido');
          return reply.status(401).send({ error: 'Unauthorized' });
        }
      }
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
      await recordSignatureEvent(envelope, input);
      return reply.status(200).send({ status: 'queued' });
    },
  );

  /**
   * Webhook da Autentique, no formato dela. Autenticidade: HMAC-SHA256 do corpo cru com o segredo
   * do endpoint cadastrado no painel da Autentique (`x-autentique-signature`); em produção o
   * segredo é obrigatório. Cada evento vira o formato interno e segue o mesmo caminho do webhook
   * de assinatura: trilha, fila do worker e auditoria. Documento de fora deste sistema, evento que
   * não muda o envelope e assinatura sem parte correspondente respondem 200 sem efeito.
   */
  app.post(
    '/webhooks/signature/autentique',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const hmacKey = app.env.AUTENTIQUE_WEBHOOK_SECRET;
      if (
        enforceProductionSecret(
          request,
          reply,
          app.env,
          Boolean(hmacKey),
          'AUTENTIQUE_WEBHOOK_SECRET',
        )
      ) {
        return reply.send({ error: 'Server misconfigured' });
      }
      if (
        hmacKey &&
        !verifyAutentiqueSignature(
          request.rawBody ?? Buffer.alloc(0),
          request.headers[AUTENTIQUE_SIGNATURE_HEADER],
          hmacKey,
        )
      ) {
        app.log.warn('autentique webhook: assinatura inválida');
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      let parsed: ReturnType<typeof parseAutentiqueWebhook>;
      try {
        parsed = parseAutentiqueWebhook(request.body);
      } catch (err) {
        if (err instanceof AutentiqueWebhookError) {
          return reply.status(400).send({ error: 'Invalid payload' });
        }
        throw err;
      }
      let queued = 0;
      for (const event of parsed.events) {
        const [envelope] = await db
          .select()
          .from(signatureEnvelopes)
          .where(
            and(
              eq(signatureEnvelopes.provider, 'AUTENTIQUE'),
              eq(signatureEnvelopes.providerEnvelopeId, event.providerEnvelopeId),
            ),
          )
          .limit(1);
        if (!envelope) {
          continue;
        }
        let signerOrder: number | undefined;
        if (event.eventType === 'SIGNER_SIGNED') {
          signerOrder = envelope.providerSigners?.find(
            (signer) => signer.providerSignerId === event.providerSignerId,
          )?.signOrder;
          if (signerOrder === undefined) {
            app.log.warn(
              { envelopeId: envelope.id },
              'autentique webhook: assinatura sem parte correspondente',
            );
            continue;
          }
        }
        await recordSignatureEvent(envelope, {
          provider: 'AUTENTIQUE',
          eventType: event.eventType,
          providerEventId: event.providerEventId,
          providerEnvelopeId: event.providerEnvelopeId,
          ...(signerOrder === undefined ? {} : { signerOrder }),
        });
        queued += 1;
      }
      return reply.status(200).send({ status: queued > 0 ? 'queued' : 'ignored' });
    },
  );

  /**
   * Trilha de assinatura (P2-08): o evento do provider fica gravado na chegada, antes do
   * processamento, e entra na fila do worker. Reentrega do mesmo evento não duplica
   * (UNIQUE provider + provider_event_id).
   */
  async function recordSignatureEvent(
    envelope: SignatureEnvelopeRow,
    input: SignatureWebhookEvent,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .insert(signatureEvents)
        .values({
          orgId: envelope.orgId,
          envelopeId: envelope.id,
          provider: input.provider,
          eventType: input.eventType,
          providerEventId: input.providerEventId,
          payload: { ...input },
        })
        .onConflictDoNothing();
      // Dedup por UNIQUE(provider, provider_event_id).
      await tx
        .insert(webhookInbox)
        .values({
          orgId: envelope.orgId,
          provider: 'SIGNATURE',
          providerEventId: `${input.provider}:${input.providerEventId}`,
          payload: { envelopeId: envelope.id, ...input },
        })
        .onConflictDoNothing();
    });
    await writeAudit(db, {
      action: AUDIT_ACTIONS.SIGNATURE_WEBHOOK_RECEIVED,
      entityType: 'WEBHOOK',
      entityId: 'signature',
      payload: { envelopeId: envelope.id, eventType: input.eventType },
    });
  }

  app.post(
    '/webhooks/payments',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      // Autenticidade (P0-02): em produção o token do provider é OBRIGATÓRIO —
      // sem ele o endpoint recusa, em vez de aceitar evento de qualquer origem.
      // A doc oficial vigente usa `asaas-access-token`; versões históricas do
      // produto usavam `asaas-webhook-token` — ambos aceitos (tempo constante).
      const expectedToken = app.env.ASAAS_WEBHOOK_TOKEN;
      if (
        enforceProductionSecret(
          request,
          reply,
          app.env,
          Boolean(expectedToken),
          'ASAAS_WEBHOOK_TOKEN',
        )
      ) {
        return reply.send({ error: 'Server misconfigured' });
      }
      if (expectedToken) {
        const header =
          typeof request.headers['asaas-webhook-token'] === 'string'
            ? (request.headers['asaas-webhook-token'] as string)
            : typeof request.headers['asaas-access-token'] === 'string'
              ? (request.headers['asaas-access-token'] as string)
              : undefined;
        if (!isValidSharedToken(header, expectedToken)) {
          app.log.warn('payments webhook: token inválido');
          return reply.status(401).send({ error: 'Unauthorized' });
        }
      }
      const input = paymentWebhookEventSchema.parse(request.body);
      // Resolve a org pela tentativa de pagamento (não confia no payload). O
      // webhook NÃO muda nada no provider nem no sistema: apenas enfileira —
      // o worker relê o status no provider antes de qualquer efeito (P0-02).
      const payment = await findPaymentByProviderId(db, input.provider, input.providerChargeId);
      if (!payment) {
        return reply.status(200).send({ status: 'ignored' });
      }
      await db
        .insert(webhookInbox)
        .values({
          orgId: payment.orgId,
          provider: 'PAYMENT',
          providerEventId: `PAY:${input.provider}:${input.providerEventId}`,
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
    const verifyToken = app.env.META_WEBHOOK_VERIFY_TOKEN;
    if (
      query['hub.mode'] !== 'subscribe' ||
      !verifyToken ||
      !isValidSharedToken(query['hub.verify_token'], verifyToken)
    ) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    return reply.type('text/plain').send(query['hub.challenge'] ?? '');
  });

  app.post(
    '/webhooks/meta',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      // Autenticidade (P1): a Meta assina o payload com X-Hub-Signature-256
      // (HMAC-SHA256 do body bruto com o app secret), igual ao WhatsApp.
      // Em produção META_APP_SECRET é OBRIGATÓRIO.
      const appSecret = app.env.META_APP_SECRET;
      if (enforceProductionSecret(request, reply, app.env, Boolean(appSecret), 'META_APP_SECRET')) {
        return reply.send({ error: 'Server misconfigured' });
      }
      if (appSecret) {
        const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
        if (
          !isValidHubSignature(
            rawBody,
            request.headers['x-hub-signature-256'] as string | undefined,
            appSecret,
          )
        ) {
          app.log.warn('meta webhook: assinatura X-Hub-Signature-256 inválida');
          return reply.status(401).send({ error: 'Unauthorized' });
        }
      }
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
