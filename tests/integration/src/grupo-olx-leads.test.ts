import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  channelConnections,
  leadPropertyInterests,
  leads,
  partyIdentities,
  timelineEvents,
  webhookInbox,
} from '@aluguei/db';
import { grupoOlxAuthorizationHeader } from '@aluguei/integrations';
import { processGrupoOlxLead } from '@aluguei/api/grupo-olx';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Leads do Grupo OLX (ADR-108): Basic Auth com a chave do software, imobiliária achada pelo
 * `clientListingId` (ou pelo CPF/CNPJ no MCMV, ou pela URL por imobiliária), caixa de entrada
 * deduplicada por `originLeadId` e o lead no CRM pelo worker. A chave aqui é de teste: a real só
 * chega com a homologação.
 */

const SECRET = 'chave-de-teste-do-grupo-olx-123456';
/** CNPJ válido de exemplo (dígitos verificadores corretos). */
const CNPJ = '11222333000181';

let sequencia = 0;
function leadDoAnuncio(clientListingId: string | null, extra: Record<string, unknown> = {}) {
  sequencia += 1;
  return {
    leadOrigin: 'Grupo OLX',
    timestamp: '2026-10-01T15:50:30.619Z',
    originLeadId: `lead-${String(Date.now())}-${String(sequencia)}`,
    originListingId: '87027856',
    ...(clientListingId === null ? {} : { clientListingId }),
    name: 'Nome Consumidor',
    email: `consumidor${String(sequencia)}@email.com`,
    ddd: '62',
    phone: `99999${String(1000 + sequencia)}`,
    message: 'Olá, tenho interesse neste imóvel.',
    temperature: 'Alta',
    transactionType: 'SELL',
    extraData: { leadCerto: false, leadType: 'CONTACT_FORM' },
    ...extra,
  };
}

describe('Grupo OLX — webhook de leads (ADR-108)', () => {
  let app: FastifyInstance;
  let db: AppDb;
  let agencia: RegisteredAgency;
  let outra: RegisteredAgency;
  let listingId: string;
  let propertyId: string;
  let ref: string;

  async function postar(payload: object, opts: { auth?: string | null; path?: string } = {}) {
    const auth = opts.auth === undefined ? grupoOlxAuthorizationHeader(SECRET) : opts.auth;
    return app.inject({
      method: 'POST',
      url: opts.path ?? '/integrations/grupo-olx/leads',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'grupozap-notification-api',
        ...(auth === null ? {} : { authorization: auth }),
      },
      payload: JSON.stringify(payload),
    });
  }

  async function ligarConexao(alvo: RegisteredAgency): Promise<void> {
    const res = await call(app, 'PUT', '/integrations/grupo-olx', {
      cookie: alvo.cookie,
      payload: {
        enabled: true,
        destinations: ['ZAP'],
        externalAccountId: null,
        externalCustomerId: null,
        listingQuota: null,
        featuredQuota: null,
        superFeaturedQuota: null,
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  async function anuncio(
    alvo: RegisteredAgency,
  ): Promise<{ listingId: string; propertyId: string }> {
    const imovel = await call(app, 'POST', '/properties', {
      cookie: alvo.cookie,
      payload: { title: 'Imóvel do lead', propertyType: 'APARTMENT', purpose: 'SALE' },
    });
    const id = (imovel.body.property as { id: string }).id;
    const criado = await call(app, 'POST', '/listings', {
      cookie: alvo.cookie,
      payload: { propertyId: id, title: `Anúncio do lead ${String((sequencia += 1))}` },
    });
    return { listingId: (criado.body.listing as { id: string }).id, propertyId: id };
  }

  beforeAll(async () => {
    app = await buildTestApp({
      env: { API_PUBLIC_URL: 'https://api.achouimovel.test', GRUPO_OLX_LEADS_SECRET_KEY: SECRET },
    });
    db = (app as unknown as { db: AppDb }).db;
    agencia = await registerAgency(app, { document: CNPJ });
    await approveAgency(app, agencia.org.id);
    outra = await registerAgency(app);
    await approveAgency(app, outra.org.id);
    await ligarConexao(agencia);
    await ligarConexao(outra);
    ({ listingId, propertyId } = await anuncio(agencia));
    const [conexao] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.orgId, agencia.org.id));
    ref = conexao?.leadsEndpointRef ?? '';
    expect(ref).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sem a chave certa: 401 (ausente, errada ou malformada)', async () => {
    expect((await postar(leadDoAnuncio(listingId), { auth: null })).statusCode).toBe(401);
    expect(
      (await postar(leadDoAnuncio(listingId), { auth: grupoOlxAuthorizationHeader('outra') }))
        .statusCode,
    ).toBe(401);
    expect((await postar(leadDoAnuncio(listingId), { auth: 'Basic ???' })).statusCode).toBe(401);
  });

  it('lead válido: 2xx na hora, CRM só no worker, sem dado pessoal na trilha', async () => {
    const payload = leadDoAnuncio(listingId, {
      extraData: { leadCerto: true, leadType: 'CLICK_WHATSAPP' },
    });
    const res = await postar(payload);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const [entrada] = await db
      .select()
      .from(webhookInbox)
      .where(
        and(
          eq(webhookInbox.provider, 'GRUPO_OLX_LEAD'),
          eq(webhookInbox.providerEventId, payload.originLeadId),
        ),
      );
    expect(entrada?.orgId).toBe(agencia.org.id);
    const antes = await db.select().from(leads).where(eq(leads.orgId, agencia.org.id));
    expect(
      antes.filter((l) => l.source === 'GRUPO_OLX'),
      'nada no CRM antes do worker',
    ).toHaveLength(0);

    await runInboxJobs({ db, limit: 20 });
    const criados = await db
      .select()
      .from(leads)
      .where(and(eq(leads.orgId, agencia.org.id), eq(leads.source, 'GRUPO_OLX')));
    expect(criados).toHaveLength(1);
    const lead = criados[0];
    expect(lead?.channel).toBe('PORTAL');
    expect(lead?.purpose, 'transactionType SELL vai para o funil de venda').toBe('SALE');
    expect(lead?.notes).toBe('Olá, tenho interesse neste imóvel.');
    const interesse = await db
      .select()
      .from(leadPropertyInterests)
      .where(eq(leadPropertyInterests.leadId, lead?.id ?? ''));
    expect(interesse.map((i) => i.propertyId)).toEqual([propertyId]);
    const identidades = await db
      .select()
      .from(partyIdentities)
      .where(eq(partyIdentities.partyId, lead?.partyId ?? ''));
    expect(identidades.map((i) => i.kind).sort()).toEqual(['EMAIL', 'PHONE']);
    const [evento] = await db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.entityId, lead?.id ?? ''));
    const trilha = JSON.stringify(evento?.payload);
    expect(trilha).toContain('CLICK_WHATSAPP');
    expect(trilha).toContain(payload.originLeadId);
    for (const pessoal of [payload.email, payload.name, payload.phone]) {
      expect(trilha).not.toContain(pessoal);
    }
  });

  it('a mesma entrega duas vezes: 2xx nas duas, um lead só, e a repetição contada', async () => {
    const payload = leadDoAnuncio(listingId);
    expect((await postar(payload)).json()).toEqual({ ok: true });
    const repetida = await postar(payload);
    expect(repetida.statusCode).toBe(200);
    expect(repetida.json()).toEqual({ ok: true, duplicate: true });
    const entradas = await db
      .select()
      .from(webhookInbox)
      .where(eq(webhookInbox.providerEventId, payload.originLeadId));
    expect(entradas).toHaveLength(1);
    const [conexao] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.orgId, agencia.org.id));
    expect(conexao?.leadDuplicateDeliveries).toBeGreaterThanOrEqual(1);
  });

  it('processar o mesmo lead duas vezes não cria dois (idempotência no worker)', async () => {
    const payload = leadDoAnuncio(listingId);
    const primeiro = await processGrupoOlxLead(db, agencia.org.id, {
      lead: payload,
      listingId,
      propertyId,
    });
    const segundo = await processGrupoOlxLead(db, agencia.org.id, {
      lead: payload,
      listingId,
      propertyId,
    });
    expect([primeiro.created, segundo.created]).toEqual([true, false]);
  });

  it('lead de anúncio sem clientListingId: 4xx, para o Grupo OLX revisar e reenviar', async () => {
    const res = await postar(leadDoAnuncio(null));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'CLIENT_LISTING_ID_MISSING' });
  });

  it('anúncio que não existe aqui: 422 (sem lead órfão)', async () => {
    const res = await postar(leadDoAnuncio('a40171'));
    expect(res.statusCode).toBe(422);
    const outroUuid = await postar(leadDoAnuncio('6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'));
    expect(outroUuid.statusCode).toBe(422);
  });

  it('MCMV sem anúncio não recebe 4xx por isso: vai para a imobiliária do CNPJ', async () => {
    const mcmv = {
      leadOrigin: 'MCMV_OLX',
      timestamp: '2026-07-10T10:15:30.000Z',
      originLeadId: `mcmv-${String(Date.now())}`,
      name: 'João da Silva',
      email: 'joao.silva@example.com',
      ddd: '11',
      phone: '987654321',
      message: 'Simulação de financiamento MCMV realizada no portal.',
      temperature: 'Média',
      transactionType: 'SELL',
      extraData: { mcmv: { sellerDocument: CNPJ, unitType: 'APARTMENT', propertyValue: 250000 } },
    };
    const res = await postar(mcmv);
    expect(res.statusCode, res.body).toBe(200);
    const [entrada] = await db
      .select()
      .from(webhookInbox)
      .where(eq(webhookInbox.providerEventId, mcmv.originLeadId));
    expect(entrada?.orgId).toBe(agencia.org.id);

    const desconhecido = await postar({
      ...mcmv,
      originLeadId: `${mcmv.originLeadId}-x`,
      extraData: { mcmv: { sellerDocument: '99888777000166' } },
    });
    expect(desconhecido.statusCode, 'sem anunciante identificável: revisão no Grupo OLX').toBe(422);
    expect(desconhecido.json()).toMatchObject({ code: 'ADVERTISER_NOT_FOUND' });
  });

  it('todos os tipos documentados e campo novo desconhecido passam', async () => {
    for (const leadType of [
      'CLICK_SCHEDULE',
      'CLICK_WHATSAPP',
      'CONTACT_CHAT',
      'CONTACT_FORM',
      'PHONE_VIEW',
      'VISIT_REQUEST',
    ]) {
      const res = await postar(
        leadDoAnuncio(listingId, {
          campoNovo: { qualquer: 1 },
          extraData: { leadType, novidade: true },
        }),
      );
      expect(res.statusCode, `${leadType}: ${res.body}`).toBe(200);
    }
  });

  it('payload sem originLeadId: 400 (sem chave de deduplicação)', async () => {
    const { originLeadId: _ignorado, ...semId } = leadDoAnuncio(listingId);
    expect((await postar(semId)).statusCode).toBe(400);
  });

  it('URL por imobiliária (se a homologação pedir): referência opaca resolve a imobiliária', async () => {
    const porRef = await postar(leadDoAnuncio('codigo-do-software-anterior'), {
      path: `/integrations/grupo-olx/leads/${ref}`,
    });
    expect(porRef.statusCode, porRef.body).toBe(200);
    const refDesconhecida = await postar(leadDoAnuncio(listingId), {
      path: '/integrations/grupo-olx/leads/referencia-que-nao-existe',
    });
    expect(refDesconhecida.statusCode).toBe(404);
    const daOutra = await anuncio(outra);
    const cruzado = await postar(leadDoAnuncio(daOutra.listingId), {
      path: `/integrations/grupo-olx/leads/${ref}`,
    });
    expect(cruzado.statusCode, 'anúncio de outra imobiliária na URL desta').toBe(422);
  });

  it('a tela conta os leads recebidos e as repetições', async () => {
    const visao = await call(app, 'GET', '/integrations/grupo-olx', { cookie: agencia.cookie });
    const contagem = visao.body.leads as { received: number; duplicates: number };
    expect(contagem.received).toBeGreaterThan(0);
    expect(contagem.duplicates).toBeGreaterThanOrEqual(1);
    expect(
      (visao.body.installation as { leadsWebhookConfigured: boolean }).leadsWebhookConfigured,
    ).toBe(true);
  });
});

describe('Grupo OLX — webhook sem a chave configurada', () => {
  it('responde 503: nada entra sem autenticação', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/integrations/grupo-olx/leads',
      headers: {
        'content-type': 'application/json',
        authorization: grupoOlxAuthorizationHeader('qualquer'),
      },
      payload: JSON.stringify(leadDoAnuncio('a40171')),
    });
    expect(res.statusCode).toBe(503);
  });
});
