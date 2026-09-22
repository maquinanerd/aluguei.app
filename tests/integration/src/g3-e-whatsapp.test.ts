import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { conversations, messages, whatsappConnections } from '@aluguei/db';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakeAi, fakeWhatsApp, registerUser } from './helpers.js';

/**
 * G3, trilha E (auditoria 2026-09-10, P1-18): o handoff era desfeito na mensagem seguinte — toda
 * mensagem recebida voltava a conversa para ACTIVE, e o bot retomava o atendimento que a pessoa
 * pediu para um humano. A conversa em atendimento humano só volta ao bot quando a equipe devolve.
 */
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

describe('G3 trilha E — handoff do WhatsApp', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const inbound = async (phoneNumberId: string, from: string, body: string): Promise<void> => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: webhookPayload(phoneNumberId, from, body),
    });
    expect(res.statusCode).toBe(200);
    await runInboxJobs({ db: app.db, limit: 10, ai: fakeAi, messenger: fakeWhatsApp });
  };

  it('conversa em atendimento humano não volta ao bot na mensagem seguinte', async () => {
    const { cookie, body } = await registerUser(app, {
      organizationName: `Imob Handoff ${Math.random().toString(36).slice(2, 6)}`,
    });
    const phoneNumberId = `70${Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, '0')}`;
    // Número com posse já comprovada (P1-18, trilha E2): só conexão VERIFIED recebe webhook.
    await app.db.insert(whatsappConnections).values({
      orgId: body.org.id,
      phoneNumberId,
      status: 'VERIFIED',
      verifiedAt: new Date(),
    });
    const from = '5511988887777';

    await inbound(phoneNumberId, from, 'quero falar com um atendente');
    const [conversation] = await app.db
      .select()
      .from(conversations)
      .where(eq(conversations.orgId, body.org.id));
    expect(conversation?.status).toBe('NEEDS_HUMAN');

    fakeWhatsApp.outbox.length = 0;
    await inbound(phoneNumberId, from, 'e o valor do aluguel?');
    const [stillHuman] = await app.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation?.id ?? ''));
    expect(stillHuman?.status, 'a conversa continua com a equipe').toBe('NEEDS_HUMAN');
    expect(fakeWhatsApp.outbox, 'o bot não responde em atendimento humano').toHaveLength(0);
    const botMessages = await app.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation?.id ?? ''));
    expect(
      botMessages.filter((m) => m.direction === 'OUTBOUND' && m.senderType === 'BOT'),
    ).toHaveLength(
      1, // só a resposta do próprio handoff
    );

    // A equipe devolve a conversa ao atendimento automático.
    const resume = await app.inject({
      method: 'POST',
      url: `/conversations/${conversation?.id ?? ''}/resume`,
      headers: { cookie },
      payload: {},
    });
    expect(resume.statusCode, resume.body).toBe(200);
    expect((resume.json() as { conversation: { status: string } }).conversation.status).toBe(
      'ACTIVE',
    );

    fakeWhatsApp.outbox.length = 0;
    await inbound(phoneNumberId, from, 'tem outro imóvel parecido?');
    expect(
      fakeWhatsApp.outbox.length,
      'depois de devolvida, o bot volta a responder',
    ).toBeGreaterThan(0);
    const [back] = await app.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation?.id ?? ''));
    expect(back?.status).toBe('ACTIVE');

    // A devolução fica auditada como o próprio handoff.
    const audit = await app.db.execute(sql`
      select action from audit_events
      where org_id = ${body.org.id} and entity_type = 'CONVERSATION'
      order by occurred_at
    `);
    expect((audit.rows as Array<{ action: string }>).map((r) => r.action)).toEqual([
      'conversation.handoff_requested',
      'conversation.handoff_returned',
    ]);
  });
});
