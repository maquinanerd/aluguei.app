import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { decryptSecret } from '@aluguei/config';
import { conversations, webhookInbox, whatsappConnections } from '@aluguei/db';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakeAi, fakeWhatsApp, testEnv } from './helpers.js';
import type { RegisteredUser } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';

/**
 * G3, trilha E2 (auditoria 2026-09-10, P1-18, segunda parte): qualquer organização com
 * `org:manage` reivindicava qualquer `phoneNumberId`, e quem reivindicava primeiro recebia o
 * webhook daquele número — as mensagens dos clientes de outra imobiliária.
 *
 * A conexão passa a guardar o token da conta do WhatsApp Business da própria imobiliária (cifrado,
 * como o token da Meta Ads, ADR-028), nasce PENDING e não recebe webhook até
 * `POST /whatsapp/connections/:id/verify` conferir o número na Graph API com esse token. Aqui o
 * verificador é o FAKE (modo dry_run): o token `fake-wa-owner:<phoneNumberId>` é o dono do número;
 * qualquer outro falha como a Graph API. Nenhuma chamada real.
 */
const ownerToken = (phoneNumberId: string): string => `fake-wa-owner:${phoneNumberId}`;

let seq = 0;
function uniquePhoneNumberId(): string {
  seq += 1;
  return `9${String(Date.now()).slice(-8)}${String(seq).padStart(2, '0')}`;
}

function webhookPayload(phoneNumberId: string, from: string, body: string): object {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from }],
              messages: [
                {
                  from,
                  id: `wamid.e2.${String(Math.random()).slice(2)}`,
                  timestamp: String(Date.now()),
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

interface ConnectionDto {
  id: string;
  orgId: string;
  phoneNumberId: string;
  status: string;
  claimExpiresAt: string | null;
  verifiedAt: string | null;
  verifiedName: string | null;
}

describe('G3 trilha E2 — prova de posse do número do WhatsApp', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Cadastro por IPs distintos (o limite de 10 cadastros por minuto do mesmo IP fica intacto).
  const newOrg = async (label: string): Promise<RegisteredUser> => {
    const agency = await registerAgency(app, {
      organizationName: `Imob ${label} ${Math.random().toString(36).slice(2, 6)}`,
    });
    await approveAgency(app, agency.org.id);
    return {
      cookie: agency.cookie,
      body: { user: agency.user, org: agency.org, membership: agency.membership },
    };
  };

  const claim = (user: RegisteredUser, phoneNumberId: string, accessToken: string) =>
    call(app, 'POST', '/whatsapp/connections', {
      cookie: user.cookie,
      payload: { phoneNumberId, accessToken },
    });

  const verify = (user: RegisteredUser, id: string) =>
    call(app, 'POST', `/whatsapp/connections/${id}/verify`, { cookie: user.cookie, payload: {} });

  const list = async (user: RegisteredUser): Promise<ConnectionDto[]> => {
    const res = await call(app, 'GET', '/whatsapp/connections', { cookie: user.cookie });
    expect(res.status).toBe(200);
    return res.body.connections as ConnectionDto[];
  };

  const auditActions = async (orgId: string): Promise<string[]> => {
    const rows = await app.db.execute(sql`
      select action from audit_events
      where org_id = ${orgId} and entity_type = 'WHATSAPP_CONNECTION'
      order by occurred_at, action
    `);
    return (rows.rows as Array<{ action: string }>).map((r) => r.action);
  };

  const deliver = async (phoneNumberId: string, from: string, body: string): Promise<void> => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: webhookPayload(phoneNumberId, from, body),
    });
    expect(res.statusCode).toBe(200);
    await runInboxJobs({ db: app.db, limit: 20, ai: fakeAi, messenger: fakeWhatsApp });
  };

  const conversationsOf = async (orgId: string) =>
    app.db.select().from(conversations).where(eq(conversations.orgId, orgId));

  it('a conexão nasce PENDING, com o token cifrado no banco e fora de qualquer resposta', async () => {
    const org = await newOrg('Pendente');
    const phoneNumberId = uniquePhoneNumberId();
    const token = ownerToken(phoneNumberId);

    const created = await claim(org, phoneNumberId, token);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const connection = created.body.connection as ConnectionDto;
    expect(connection.status).toBe('PENDING');
    expect(connection.verifiedAt).toBeNull();
    const expiresIn = new Date(connection.claimExpiresAt ?? 0).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(JSON.stringify(created.body)).not.toContain(token);
    expect(JSON.stringify(await list(org))).not.toContain(token);

    const [row] = await app.db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connection.id));
    expect(row?.accessTokenEncrypted, 'token gravado cifrado').toBeTruthy();
    expect(row?.accessTokenEncrypted).not.toContain(token);
    const [keyId, iv, value] = (row?.accessTokenEncrypted ?? '').split(':');
    expect(keyId).toBe(row?.tokenKeyId);
    expect(
      decryptSecret(
        { keyId: keyId ?? '', iv: iv ?? '', value: value ?? '' },
        testEnv.META_TOKEN_ENCRYPTION_KEY ?? '',
      ),
    ).toBe(token);

    expect(await auditActions(org.body.org.id)).toEqual(['whatsapp.connection_claimed']);
  });

  it('número PENDING não recebe webhook: nada entra na fila nem vira conversa', async () => {
    const org = await newOrg('Sem prova');
    const phoneNumberId = uniquePhoneNumberId();
    const created = await claim(org, phoneNumberId, ownerToken(phoneNumberId));
    expect(created.status).toBe(201);

    await deliver(phoneNumberId, '5511955554444', 'oi, tem apartamento?');
    const queued = await app.db
      .select()
      .from(webhookInbox)
      .where(and(eq(webhookInbox.orgId, org.body.org.id), eq(webhookInbox.provider, 'WHATSAPP')));
    expect(queued, 'nada enfileirado para a organização que só reivindicou').toHaveLength(0);
    expect(await conversationsOf(org.body.org.id)).toHaveLength(0);
  });

  it('verificar com o token errado falha e mantém PENDING; com o token certo, VERIFIED e webhook liberado', async () => {
    const org = await newOrg('Prova');
    const phoneNumberId = uniquePhoneNumberId();
    const created = await claim(org, phoneNumberId, ownerToken('outro-numero'));
    expect(created.status).toBe(201);
    const id = (created.body.connection as ConnectionDto).id;

    const failed = await verify(org, id);
    expect(failed.status, JSON.stringify(failed.body)).toBe(409);
    expect(String(failed.body.message)).toContain('posse');
    expect((await list(org))[0]?.status).toBe('PENDING');

    // A própria organização troca o token da reivindicação pendente.
    const renewed = await claim(org, phoneNumberId, ownerToken(phoneNumberId));
    expect(renewed.status, JSON.stringify(renewed.body)).toBe(200);
    expect((renewed.body.connection as ConnectionDto).id).toBe(id);

    const verified = await verify(org, id);
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    const connection = verified.body.connection as ConnectionDto;
    expect(connection.status).toBe('VERIFIED');
    expect(connection.verifiedAt).toBeTruthy();
    expect(connection.claimExpiresAt).toBeNull();
    expect(connection.verifiedName).toBeTruthy();

    // Verificar de novo não muda nada (idempotente).
    const again = await verify(org, id);
    expect(again.status).toBe(200);
    expect((again.body.connection as ConnectionDto).verifiedAt).toBe(connection.verifiedAt);

    await deliver(phoneNumberId, '5511944443333', 'quero falar com um atendente');
    expect(await conversationsOf(org.body.org.id)).toHaveLength(1);

    expect(await auditActions(org.body.org.id)).toEqual([
      'whatsapp.connection_claimed',
      'whatsapp.connection_verification_failed',
      'whatsapp.connection_claimed',
      'whatsapp.connection_verified',
    ]);
  });

  it('número VERIFIED não pode ser reivindicado por outra organização, nem com o token certo (409)', async () => {
    const owner = await newOrg('Dona');
    const intruder = await newOrg('Intrusa');
    const phoneNumberId = uniquePhoneNumberId();
    const created = await claim(owner, phoneNumberId, ownerToken(phoneNumberId));
    const id = (created.body.connection as ConnectionDto).id;
    expect((await verify(owner, id)).status).toBe(200);

    const refused = await claim(intruder, phoneNumberId, ownerToken(phoneNumberId));
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(await list(intruder)).toHaveLength(0);
    const [row] = await app.db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.phoneNumberId, phoneNumberId));
    expect(row?.orgId).toBe(owner.body.org.id);
    expect(row?.status).toBe('VERIFIED');

    // A própria dona também não troca o token de um número já verificado.
    const own = await claim(owner, phoneNumberId, ownerToken(phoneNumberId));
    expect(own.status).toBe(409);

    // A recusa fica auditada na organização que tentou, sem dados da dona.
    const refusal = await app.db.execute(sql`
      select action, payload from audit_events
      where org_id = ${intruder.body.org.id} and entity_type = 'WHATSAPP_CONNECTION'
    `);
    const refusalRows = refusal.rows as Array<{ action: string; payload: unknown }>;
    expect(refusalRows.map((r) => r.action)).toEqual(['whatsapp.connection_claim_refused']);
    expect(JSON.stringify(refusalRows[0]?.payload)).not.toContain(owner.body.org.id);
  });

  it('reivindicação PENDING de outra organização: 409 no prazo; vencida, só quem prova a posse toma', async () => {
    const squatter = await newOrg('Posseira');
    const owner = await newOrg('Dona real');
    const phoneNumberId = uniquePhoneNumberId();
    const squat = await claim(squatter, phoneNumberId, 'token-qualquer-sem-posse');
    expect(squat.status).toBe(201);
    const squatId = (squat.body.connection as ConnectionDto).id;

    // Dentro do prazo, ninguém mais reivindica.
    const early = await claim(owner, phoneNumberId, ownerToken(phoneNumberId));
    expect(early.status, JSON.stringify(early.body)).toBe(409);

    // O prazo vence.
    await app.db
      .update(whatsappConnections)
      .set({ claimExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(whatsappConnections.id, squatId));

    // Vencida, reivindicar sem provar a posse não toma o número.
    const noProof = await claim(owner, phoneNumberId, ownerToken('outro-numero'));
    expect(noProof.status, JSON.stringify(noProof.body)).toBe(409);
    const [kept] = await app.db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.phoneNumberId, phoneNumberId));
    expect(kept?.id, 'a reivindicação antiga continua até alguém provar a posse').toBe(squatId);

    // Com a prova, a nova organização toma o número já verificado.
    const takeover = await claim(owner, phoneNumberId, ownerToken(phoneNumberId));
    expect(takeover.status, JSON.stringify(takeover.body)).toBe(201);
    const taken = takeover.body.connection as ConnectionDto;
    expect(taken.status).toBe('VERIFIED');
    expect(taken.orgId).toBe(owner.body.org.id);
    expect(taken.id).not.toBe(squatId);
    expect(await list(squatter)).toHaveLength(0);
    expect((await verify(squatter, squatId)).status).toBe(404);

    await deliver(phoneNumberId, '5511933332222', 'bom dia');
    expect(await conversationsOf(owner.body.org.id)).toHaveLength(1);
    expect(await conversationsOf(squatter.body.org.id)).toHaveLength(0);

    // A organização que perdeu a reivindicação fica sabendo, sem saber quem tomou.
    const lost = await app.db.execute(sql`
      select action, payload from audit_events
      where org_id = ${squatter.body.org.id} and entity_type = 'WHATSAPP_CONNECTION'
      order by occurred_at
    `);
    const lostRows = lost.rows as Array<{ action: string; payload: unknown }>;
    expect(lostRows.map((r) => r.action)).toEqual([
      'whatsapp.connection_claimed',
      'whatsapp.connection_claim_expired',
    ]);
    expect(JSON.stringify(lostRows[1]?.payload)).not.toContain(owner.body.org.id);
    expect(await auditActions(owner.body.org.id)).toEqual([
      'whatsapp.connection_claim_refused',
      'whatsapp.connection_verification_failed',
      'whatsapp.connection_claimed',
      'whatsapp.connection_verified',
    ]);
  });

  it('conexão de outra organização: verificar responde 404', async () => {
    const owner = await newOrg('Dona 404');
    const other = await newOrg('Outra 404');
    const phoneNumberId = uniquePhoneNumberId();
    const created = await claim(owner, phoneNumberId, ownerToken(phoneNumberId));
    const res = await verify(other, (created.body.connection as ConnectionDto).id);
    expect(res.status).toBe(404);
    expect((await list(owner))[0]?.status).toBe('PENDING');
  });

  it('conexão antiga sem token não é verificada: a organização precisa informar o token', async () => {
    const org = await newOrg('Legada');
    const phoneNumberId = uniquePhoneNumberId();
    const [legacy] = await app.db
      .insert(whatsappConnections)
      .values({
        orgId: org.body.org.id,
        phoneNumberId,
        status: 'PENDING',
        claimExpiresAt: new Date(),
      })
      .returning();
    const res = await verify(org, legacy?.id ?? '');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(String(res.body.message)).toContain('token');
  });

  it('o pedido exige o token da conta do WhatsApp Business', async () => {
    const org = await newOrg('Sem token');
    const res = await call(app, 'POST', '/whatsapp/connections', {
      cookie: org.cookie,
      payload: { phoneNumberId: uniquePhoneNumberId() },
    });
    expect(res.status).toBe(400);
  });
});
