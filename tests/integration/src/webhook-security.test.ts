import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '@aluguei/api';
import { createTestDb, webhookInbox } from '@aluguei/db';
import type { AppEnv } from '@aluguei/config';
import {
  FakeChannel,
  FakeMetaAdsProvider,
  FakePaymentProvider,
  FakeScreeningProvider,
  FakeSignatureProvider,
  FakeWhatsAppMessenger,
  MockAiProvider,
} from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { FakeStorageService } from './fakes.js';
import { registerUser, testEnv } from './helpers.js';

/**
 * Fase 03 â€” Hardening de webhooks (P1 da auditoria final):
 * assinatura/token obrigatÃ³rios + idempotÃªncia + replay.
 */
const SECRETS_ENV: AppEnv = {
  ...testEnv,
  META_APP_SECRET: 'meta-app-secret-audit',
  SIGNATURE_WEBHOOK_TOKEN: 'sig-token-audit',
  ASAAS_WEBHOOK_TOKEN: 'asaas-token-audit',
  META_WEBHOOK_VERIFY_TOKEN: 'meta-verify-audit',
};

function hubSignature(rawBody: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Valores com fallback para evitar non-null assertions nos testes.
const META_SECRET = SECRETS_ENV.META_APP_SECRET ?? '';
const SIG_TOKEN = SECRETS_ENV.SIGNATURE_WEBHOOK_TOKEN ?? '';
const ASAAS_TOKEN = SECRETS_ENV.ASAAS_WEBHOOK_TOKEN ?? '';
const META_VERIFY = SECRETS_ENV.META_WEBHOOK_VERIFY_TOKEN ?? '';

describe('Fase 03: seguranÃ§a de webhooks (assinaturas e tokens)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const db = await createTestDb();
    app = await buildApp({
      db,
      env: SECRETS_ENV,
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      channels: { fake: new FakeChannel() },
      whatsapp: new FakeWhatsAppMessenger('verify-token-audit'),
      ai: new MockAiProvider(),
      signature: new FakeSignatureProvider(),
      payments: new FakePaymentProvider(),
      meta: new FakeMetaAdsProvider(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------- WhatsApp (X-Hub-Signature-256) ----------

  it('whatsapp: assinatura vÃ¡lida â†’ aceita', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: 'PN-UNKNOWN' },
                messages: [],
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload,
      headers: { 'x-hub-signature-256': hubSignature(raw, META_SECRET) },
    });
    expect(res.statusCode).toBe(200);
  });

  it('whatsapp: assinatura invÃ¡lida â†’ 401', async () => {
    const payload = { object: 'whatsapp_business_account', entry: [] };
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload,
      headers: { 'x-hub-signature-256': hubSignature(JSON.stringify(payload), 'segredo-errado') },
    });
    expect(res.statusCode).toBe(401);
  });

  it('whatsapp: sem assinatura com secret configurado â†’ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { object: 'whatsapp_business_account', entry: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  // ---------- Signature (Bearer token) ----------

  it('signature: sem token â†’ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/signature',
      payload: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: 'evt-x',
        providerEnvelopeId: 'env-x',
        signerOrder: 1,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('signature: token errado â†’ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/signature',
      headers: { authorization: 'Bearer token-errado' },
      payload: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: 'evt-x',
        providerEnvelopeId: 'env-x',
        signerOrder: 1,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('signature: token vÃ¡lido + envelope desconhecido â†’ 200 ignored (sem enfileirar)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/signature',
      headers: { authorization: `Bearer ${SIG_TOKEN}` },
      payload: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: 'evt-x',
        providerEnvelopeId: 'env-desconhecido',
        signerOrder: 1,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ignored' });
  });

  // ---------- Payments (asaas-webhook-token) ----------

  it('payments: sem token â†’ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/payments',
      payload: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: 'pay-x',
        providerChargeId: 'pc-x',
        amountCents: 1000,
        paidAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('payments: token errado â†’ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/payments',
      headers: { 'asaas-webhook-token': 'errado' },
      payload: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: 'pay-x',
        providerChargeId: 'pc-x',
        amountCents: 1000,
        paidAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('payments: token vÃ¡lido + charge desconhecida â†’ 200 ignored', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/payments',
      headers: { 'asaas-webhook-token': ASAAS_TOKEN },
      payload: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: 'pay-x',
        providerChargeId: 'pc-desconhecida',
        amountCents: 1000,
        paidAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ignored' });
  });

  // ---------- Meta (X-Hub-Signature-256) ----------

  it('meta: assinatura invÃ¡lida â†’ 401', async () => {
    const payload = {
      adAccountId: 'act_unknown',
      eventType: 'AD_ACCOUNT_UPDATE',
      providerEventId: 'meta-evt-x',
    };
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      payload,
      headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('meta: sem assinatura com secret â†’ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      payload: { adAccountId: 'act_unknown', eventType: 'X', providerEventId: 'meta-evt-y' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('meta: assinatura vÃ¡lida + ad account desconhecido â†’ 200 ignored', async () => {
    const payload = {
      provider: 'META',
      adAccountId: 'act_unknown',
      eventType: 'AD_ACCOUNT_UPDATE',
      providerEventId: 'meta-evt-z',
    };
    const raw = JSON.stringify(payload);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      payload,
      headers: { 'x-hub-signature-256': hubSignature(raw, META_SECRET) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ignored' });
  });

  it('meta: GET verify token errado â†’ 403; certo â†’ challenge', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/webhooks/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc',
    });
    expect(bad.statusCode).toBe(403);
    const ok = await app.inject({
      method: 'GET',
      url: `/webhooks/meta?hub.mode=subscribe&hub.verify_token=${META_VERIFY}&hub.challenge=abc`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('abc');
  });

  // ---------- IdempotÃªncia / replay ----------

  it('signature: evento duplicado â†’ idempotente (1 linha no inbox)', async () => {
    // Cria envelope real via fluxo de contrato para resoluÃ§Ã£o por envelope.
    const { cookie } = await registerUser(app);
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Apto Webhook', propertyType: 'APARTMENT' },
    });
    const propertyId = (prop.json() as { property: { id: string } }).property.id;
    const party = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'LocatÃ¡rio Webhook',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    const partyId = (party.json() as { party: { id: string } }).party.id;
    await app.inject({
      method: 'POST',
      url: `/parties/${partyId}/consents`,
      headers: { cookie },
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    const appli = await app.inject({
      method: 'POST',
      url: '/rental-applications',
      headers: { cookie },
      payload: { partyId, propertyId },
    });
    const applicationId = (appli.json() as { application: { id: string } }).application.id;
    await app.inject({
      method: 'PATCH',
      url: `/rental-applications/${applicationId}/status`,
      headers: { cookie },
      payload: { status: 'SUBMITTED' },
    });
    await app.inject({
      method: 'POST',
      url: `/rental-applications/${applicationId}/screening`,
      headers: { cookie },
      payload: { provider: 'FAKE' },
    });
    await runInboxJobs({
      db: app.db,
      limit: 10,
      screening: new FakeScreeningProvider(),
      signature: new FakeSignatureProvider(),
      payments: new FakePaymentProvider(),
    });
    const tpl = await app.inject({
      method: 'POST',
      url: '/contract-templates',
      headers: { cookie },
      payload: {
        name: 'T Webhook',
        body: 'PROP: {{landlordName}} TEN: {{tenantName}} IMOV: {{propertyTitle}} ALUGUEL: {{monthlyRentCents}}',
      },
    });
    const templateId = (tpl.json() as { template: { id: string } }).template.id;
    await app.inject({
      method: 'PATCH',
      url: `/contract-templates/${templateId}/approve`,
      headers: { cookie },
      payload: {},
    });
    const ctr = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { cookie },
      payload: { applicationId, templateId },
    });
    const contractId = (ctr.json() as { contract: { id: string } }).contract.id;
    await app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/generate`,
      headers: { cookie },
      payload: {},
    });
    const send = await app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/send-for-signature`,
      headers: { cookie },
      payload: {},
    });
    const envelopeId = (send.json() as { envelope: { providerEnvelopeId: string } }).envelope
      .providerEnvelopeId;

    const event = {
      provider: 'FAKE',
      eventType: 'SIGNER_SIGNED',
      providerEventId: `dup-event-${String(Date.now())}`,
      providerEnvelopeId: envelopeId,
      signerOrder: 1,
    };
    const headers = { authorization: `Bearer ${SIG_TOKEN}` };
    const first = await app.inject({
      method: 'POST',
      url: '/webhooks/signature',
      headers,
      payload: event,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/webhooks/signature',
      headers,
      payload: event,
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const rows = await app.db
      .select()
      .from(webhookInbox)
      .where(eq(webhookInbox.providerEventId, `FAKE:${event.providerEventId}`));
    expect(rows.length).toBe(1);
  });
});
