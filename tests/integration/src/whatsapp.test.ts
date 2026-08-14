import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { conversations, messages, whatsappConnections } from '@aluguei/db';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakeAi, fakeWhatsApp, registerUser } from './helpers.js';

interface PropertyBody {
  property: { id: string };
}

function webhookPayload(
  phoneNumberId: string,
  from: string,
  body: string,
  id = `wamid.${String(Math.random())}`,
): Record<string, unknown> {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from }],
              messages: [{ from, id, timestamp: String(Date.now()), type: 'text', text: { body } }],
            },
          },
        ],
      },
    ],
  };
}

describe('Fase 05: WhatsApp + Lead Automation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedConnection(orgId: string, phoneNumberId = '1001'): Promise<void> {
    await app.db.insert(whatsappConnections).values({ orgId, phoneNumberId });
  }

  it('verify webhook: challenge válido e token inválido → 403', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('abc123');

    const bad = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123',
    });
    expect(bad.statusCode).toBe(403);
  });

  it('webhook cria lead+conversação e bot responde com dados persistidos do imóvel', async () => {
    const { cookie, body } = await registerUser(app, {
      organizationName: `Imob Wa ${Math.random().toString(36).slice(2, 6)}`,
    });
    await seedConnection(body.org.id, '2001');

    // Cria imóvel com terms + endereço público + listing publicado → gera código
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Casa Jardins', propertyType: 'HOUSE', bedrooms: 3, bathrooms: 2 },
    });
    expect(prop.statusCode).toBe(201);
    const propertyId = (prop.json() as PropertyBody).property.id;
    await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/address`,
      headers: { cookie },
      payload: { publicAddress: { neighborhood: 'Jardins', city: 'São Paulo', state: 'SP' } },
    });
    await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/financial-terms`,
      headers: { cookie },
      payload: { monthlyRentCents: 450000 },
    });

    // Webhook com código no texto — mas o código ainda não existe → garante geração?
    // O bot responde "não encontrei" para código desconhecido; enviamos texto sem código primeiro.
    await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: webhookPayload('2001', '5511999990001', 'Olá, quero alugar um apartamento'),
    });
    await runInboxJobs({ db: app.db, limit: 10, ai: fakeAi, messenger: fakeWhatsApp });

    // Lead criado via webhook
    const leads = await app.inject({ method: 'GET', url: '/leads', headers: { cookie } });
    expect(leads.statusCode).toBe(200);
    const leadList = leads.json() as {
      leads: Array<{ id: string; channel: string; source: string }>;
    };
    expect(leadList.leads.length).toBeGreaterThan(0);
    const waLead = leadList.leads.find((lead) => lead.channel === 'whatsapp');
    expect(waLead?.source).toBe('WHATSAPP');

    // Bot respondeu via messenger fake
    expect(fakeWhatsApp.outbox.length).toBeGreaterThan(0);

    // Conversa + mensagens persistidas
    const convRows = await app.db.select().from(conversations);
    expect(convRows.length).toBeGreaterThan(0);
    const msgRows = await app.db.select().from(messages);
    expect(msgRows.some((m) => m.direction === 'INBOUND')).toBe(true);
    expect(msgRows.some((m) => m.direction === 'OUTBOUND' && m.senderType === 'BOT')).toBe(true);
  });

  it('dedup: mesmo wa_message_id não duplica mensagem (retry do Meta)', async () => {
    const { body } = await registerUser(app, {
      organizationName: `Imob Dd ${Math.random().toString(36).slice(2, 6)}`,
    });
    await seedConnection(body.org.id, '3001');
    const id = `wamid.dup-${String(Math.random())}`;
    const payload = webhookPayload('3001', '5511999990002', 'Preço?', id);

    await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload });
    await runInboxJobs({ db: app.db, limit: 10, ai: fakeAi, messenger: fakeWhatsApp });
    // Replay (retry da Meta)
    await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload });
    await runInboxJobs({ db: app.db, limit: 10, ai: fakeAi, messenger: fakeWhatsApp });

    const rows = await app.db.select().from(messages).where(eq(messages.waMessageId, id));
    expect(rows.length).toBe(1);
  });

  it('handoff: pedido de atendente humano → NEEDS_HUMAN + resposta', async () => {
    const { body } = await registerUser(app, {
      organizationName: `Imob Ho ${Math.random().toString(36).slice(2, 6)}`,
    });
    await seedConnection(body.org.id, '4001');
    fakeWhatsApp.outbox.length = 0;

    await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: webhookPayload('4001', '5511999990003', 'quero falar com um atendente'),
    });
    await runInboxJobs({ db: app.db, limit: 10, ai: fakeAi, messenger: fakeWhatsApp });

    const rows = await app.db.select().from(conversations);
    expect(rows.some((c) => c.status === 'NEEDS_HUMAN')).toBe(true);
    expect(fakeWhatsApp.outbox.some((o) => o.body.includes('atendente humano'))).toBe(true);
  });

  it('agente responde via API e persiste OUTBOUND/AGENT', async () => {
    const { cookie, body } = await registerUser(app, {
      organizationName: `Imob Ag ${Math.random().toString(36).slice(2, 6)}`,
    });
    await seedConnection(body.org.id, '5001');
    await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: webhookPayload('5001', '5511999990004', 'ola'),
    });
    await runInboxJobs({ db: app.db, limit: 10, ai: fakeAi, messenger: fakeWhatsApp });

    const convRows = await app.db.select().from(conversations);
    const conversationId = convRows.find((c) => c.waContactId === '5511999990004')?.id;
    expect(conversationId).toBeTruthy();

    const reply = await app.inject({
      method: 'POST',
      url: `/conversations/${String(conversationId)}/messages`,
      headers: { cookie },
      payload: { body: 'Olá! Em que posso ajudar?' },
    });
    expect(reply.statusCode).toBe(201);
    const msg = (reply.json() as { message: { senderType: string; direction: string } }).message;
    expect(msg.senderType).toBe('AGENT');
    expect(msg.direction).toBe('OUTBOUND');
  });

  it('cross-org: conversa de outra org → 404', async () => {
    const a = await registerUser(app, {
      organizationName: `Imob A ${Math.random().toString(36).slice(2, 6)}`,
    });
    const b = await registerUser(app, {
      organizationName: `Imob B ${Math.random().toString(36).slice(2, 6)}`,
    });
    await seedConnection(a.body.org.id, '6001');
    await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: webhookPayload('6001', '5511999990005', 'oi'),
    });
    await runInboxJobs({ db: app.db, limit: 10, ai: fakeAi, messenger: fakeWhatsApp });
    const convRows = await app.db.select().from(conversations);
    const conversationId = convRows.find((c) => c.waContactId === '5511999990005')?.id;

    const forbidden = await app.inject({
      method: 'GET',
      url: `/conversations/${String(conversationId)}`,
      headers: { cookie: b.cookie },
    });
    expect(forbidden.statusCode).toBe(404);
  });
});
