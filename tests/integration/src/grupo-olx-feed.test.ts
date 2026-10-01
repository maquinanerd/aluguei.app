import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { channelConnections, channelFeedFetches, channelSyncJobs } from '@aluguei/db';
import { runChannelJobs } from '@aluguei/worker/channel-jobs';
import { applyCrawlerFetch } from '@aluguei/api/grupo-olx';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';
import {
  API_PUBLIC_URL,
  BROWSER,
  CRAWLER,
  MemoryStorage,
  grupoOlxFixtures,
} from './grupo-olx-fixtures.js';
import type { GrupoOlxFixtures } from './grupo-olx-fixtures.js';

/**
 * Grupo OLX / Canal Pro (ADR-107): conexão por imobiliária, token opaco, avaliação de cada anúncio,
 * feed VRSync por token, estados de feed (entrar no XML não é estar publicado) e fotos JPG com URL
 * estável. Nada aqui fala com o Grupo OLX: o "robô" é uma requisição com o User-Agent dele.
 */

describe('Grupo OLX — feed VRSync por token (ADR-107)', () => {
  let app: FastifyInstance;
  let db: AppDb;
  let fx: GrupoOlxFixtures;
  let agencia: RegisteredAgency;
  let outra: RegisteredAgency;
  let feedPath: string;

  const prepararImobiliaria = (alvo: RegisteredAgency) => fx.prepararImobiliaria(alvo);
  const criarAnuncio = (...args: Parameters<GrupoOlxFixtures['criarAnuncio']>) =>
    fx.criarAnuncio(...args);
  const publicar = (...args: Parameters<GrupoOlxFixtures['publicar']>) => fx.publicar(...args);
  const estado = (listingId: string) => fx.estado(listingId);
  const buscar = (path: string, userAgent: string) => fx.buscar(path, userAgent);

  beforeAll(async () => {
    const storage = new MemoryStorage();
    app = await buildTestApp({ env: { API_PUBLIC_URL }, storage });
    fx = grupoOlxFixtures(app, storage);
    db = fx.db;
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id);
    outra = await registerAgency(app);
    await approveAgency(app, outra.org.id);
    feedPath = await prepararImobiliaria(agencia);
  });

  afterAll(async () => {
    await app.close();
  });

  it('suítes entram no imóvel e não passam o número de quartos', async () => {
    const recusado = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Suítes demais', propertyType: 'APARTMENT', bedrooms: 1, suites: 2 },
    });
    expect(recusado.status).toBe(400);
    const criado = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Com suítes', propertyType: 'APARTMENT', bedrooms: 3, suites: 2 },
    });
    expect(criado.status).toBe(201);
    const id = (criado.body.property as { id: string }).id;
    expect((criado.body.property as { suites: number }).suites).toBe(2);
    const patch = await call(app, 'PATCH', `/properties/${id}`, {
      cookie: agencia.cookie,
      payload: { bedrooms: 1 },
    });
    expect(patch.status, 'baixar quartos para menos que as suítes também é recusado').toBe(400);
  });

  it('e-mail público da imobiliária: campo próprio, validado e normalizado', async () => {
    const lido = await call(app, 'GET', '/organization/contact', { cookie: agencia.cookie });
    expect(lido.body).toEqual({ publicContactEmail: 'contato@imobiliaria.test' });
    const invalido = await call(app, 'PUT', '/organization/contact', {
      cookie: outra.cookie,
      payload: { publicContactEmail: 'sem-arroba' },
    });
    expect(invalido.status).toBe(400);
  });

  it('o token aparece uma vez: o banco guarda o hash e a tela, só o final', async () => {
    const token = (feedPath.split('/').pop() ?? '').replace(/\.xml$/, '');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [conexao] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.orgId, agencia.org.id));
    expect(conexao?.feedTokenHash).not.toBe(token);
    expect(conexao?.feedTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(conexao?.feedTokenHint).toBe(token.slice(-4));
    const visao = await call(app, 'GET', '/integrations/grupo-olx', { cookie: agencia.cookie });
    expect(visao.status).toBe(200);
    expect(JSON.stringify(visao.body)).not.toContain(token);
    expect(visao.body.stage).toBe('IMPLEMENTED_NOT_LIVE_VERIFIED');
    expect((visao.body.connection as { feedToken: { hint: string } }).feedToken.hint).toBe(
      token.slice(-4),
    );
  });

  it('GET /channels: Grupo OLX é FEED e aparece; Canal Pro, ZAP, Viva Real e OLX antigos não', async () => {
    const res = await call(app, 'GET', '/channels', { cookie: agencia.cookie });
    const canais = res.body.channels as Array<{
      channel: string;
      offered: boolean;
      available: boolean;
      mode: string | null;
      stage: string;
    }>;
    expect(canais.find((c) => c.channel === 'grupoolx')).toEqual({
      channel: 'grupoolx',
      offered: true,
      available: true,
      mode: 'FEED',
      stage: 'IMPLEMENTED_NOT_LIVE_VERIFIED',
    });
    for (const antigo of ['canalpro', 'vivareal', 'zap', 'olx']) {
      expect(canais.find((c) => c.channel === antigo)?.offered, antigo).toBe(false);
    }
    const semConexao = await call(app, 'GET', '/channels', { cookie: outra.cookie });
    const grupo = (semConexao.body.channels as Array<{ channel: string; available: boolean }>).find(
      (c) => c.channel === 'grupoolx',
    );
    expect(grupo?.available, 'sem conexão ligada o canal não recebe publicação').toBe(false);
  });

  it('publicar sem a conexão ligada é recusado', async () => {
    const { listingId } = await criarAnuncio(outra);
    const res = await publicar(outra, listingId);
    expect(res.status).toBe(409);
  });

  it('anúncio completo fica ELIGIBLE na hora; comercial sem tipo fica BLOCKED com o motivo', async () => {
    const completo = await criarAnuncio(agencia);
    const res = await publicar(agencia, completo.listingId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.job).toBeNull();
    expect((res.body.publication as { status: string }).status).toBe('ELIGIBLE');

    const comercial = await criarAnuncio(agencia, { propertyType: 'COMMERCIAL' });
    const bloqueado = await publicar(agencia, comercial.listingId);
    const publicacao = bloqueado.body.publication as {
      status: string;
      issues: Array<{ code: string }>;
    };
    expect(publicacao.status).toBe('BLOCKED');
    expect(publicacao.issues.map((i) => i.code)).toContain('PORTAL_PROPERTY_TYPE_REQUIRED');

    const incompativel = await call(
      app,
      'PATCH',
      `/integrations/grupo-olx/listings/${comercial.listingId}`,
      { cookie: agencia.cookie, payload: { portalPropertyType: 'Residential / Apartment' } },
    );
    expect(incompativel.status).toBe(200);
    expect((incompativel.body.issues as Array<{ code: string }>).map((i) => i.code)).toContain(
      'PORTAL_PROPERTY_TYPE_INVALID',
    );
    const ajustado = await call(
      app,
      'PATCH',
      `/integrations/grupo-olx/listings/${comercial.listingId}`,
      { cookie: agencia.cookie, payload: { portalPropertyType: 'Commercial / Office' } },
    );
    expect(ajustado.body.status).toBe('ELIGIBLE');
    const opcoes = await call(
      app,
      'GET',
      `/integrations/grupo-olx/listings/${comercial.listingId}/property-type-options`,
      { cookie: agencia.cookie },
    );
    expect(opcoes.body.defaultType).toBeNull();
    expect(opcoes.body.options).toContain('Commercial / Office');
  });

  it('publicar com tipo incompatível no pedido é recusado com 400', async () => {
    const { listingId } = await criarAnuncio(agencia);
    const res = await publicar(agencia, listingId, { portalPropertyType: 'Commercial / Office' });
    expect(res.status).toBe(400);
  });

  it('o robô leva só os válidos; a busca dele move o estado, a do navegador não', async () => {
    const valido = await criarAnuncio(agencia);
    await publicar(agencia, valido.listingId);
    const semCep = await criarAnuncio(agencia, { cep: null });
    await publicar(agencia, semCep.listingId);
    const poucasFotos = await criarAnuncio(agencia, { fotos: 4 });
    await publicar(agencia, poucasFotos.listingId);
    expect((await estado(semCep.listingId))?.status).toBe('BLOCKED');

    const navegador = await buscar(feedPath, BROWSER);
    expect(navegador.statusCode).toBe(200);
    expect(navegador.headers['content-type']).toContain('application/xml');
    expect((await estado(valido.listingId))?.status, 'navegador não move estado').toBe('ELIGIBLE');

    const robo = await buscar(feedPath, CRAWLER);
    expect(robo.statusCode).toBe(200);
    const xml = robo.body;
    expect(xml).toContain('<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"');
    expect(xml).toContain(`<ListingID>${valido.listingId}</ListingID>`);
    expect(xml).not.toContain(semCep.listingId);
    expect(xml).not.toContain(poucasFotos.listingId);
    expect(xml).toContain('<Location displayAddress="Neighborhood">');
    expect(xml).toContain('<Email>contato@imobiliaria.test</Email>');
    expect(xml).toMatch(
      new RegExp(`${API_PUBLIC_URL}/integrations/grupo-olx/media/[0-9a-f-]{36}/[0-9a-f]{16}\\.jpg`),
    );

    const depois = await estado(valido.listingId);
    expect(depois?.status, 'entrar no XML não é estar publicado').toBe('AWAITING_IMPORT');
    expect(depois?.lastInFeedAt).not.toBeNull();
    expect(depois?.feedContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await estado(poucasFotos.listingId))?.status).toBe('BLOCKED');

    const buscas = await db
      .select()
      .from(channelFeedFetches)
      .where(eq(channelFeedFetches.orgId, agencia.org.id));
    expect(buscas.map((b) => b.isCrawler).sort()).toEqual([false, true]);
    const [conexao] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.orgId, agencia.org.id));
    expect(conexao?.lastCrawlerFetchAt).not.toBeNull();
    expect(conexao?.lastCrawlerListingCount).toBeGreaterThanOrEqual(1);
  });

  it('HEAD do robô diz se a URL vale sem gerar o arquivo nem mover estado', async () => {
    const { listingId } = await criarAnuncio(agencia);
    await publicar(agencia, listingId);
    const antes = await db
      .select()
      .from(channelFeedFetches)
      .where(eq(channelFeedFetches.orgId, agencia.org.id));
    const head = await app.inject({
      method: 'HEAD',
      url: feedPath,
      headers: { 'user-agent': CRAWLER },
    });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect((await estado(listingId))?.status).toBe('ELIGIBLE');
    const depois = await db
      .select()
      .from(channelFeedFetches)
      .where(eq(channelFeedFetches.orgId, agencia.org.id));
    expect(depois).toHaveLength(antes.length);
    const falso = await app.inject({
      method: 'HEAD',
      url: `/integrations/grupo-olx/feed/${'B'.repeat(43)}.xml`,
    });
    expect(falso.statusCode).toBe(404);
  });

  it('tirado no meio da busca, mas levado nela: REMOVING até a próxima, não REMOVED', async () => {
    const { listingId } = await criarAnuncio(agencia);
    await publicar(agencia, listingId);
    const lido = await estado(listingId);
    const inicioDaBusca = new Date(Date.now() - 1000);
    // A imobiliária tira enquanto o robô ainda baixa o arquivo que já leva o anúncio.
    const tirado = await call(app, 'POST', `/listings/${listingId}/channels/grupoolx/remove`, {
      cookie: agencia.cookie,
      payload: {},
    });
    expect((tirado.body.publication as { status: string }).status).toBe('REMOVED');
    await applyCrawlerFetch(
      db,
      agencia.org.id,
      [
        {
          publicationId: lido?.id ?? '',
          current: 'ELIGIBLE',
          included: true,
          previousHash: null,
          hash: 'a'.repeat(64),
          issues: [],
        },
      ],
      inicioDaBusca,
    );
    const depois = await estado(listingId);
    expect(depois?.status).toBe('REMOVING');
    expect(depois?.lastInFeedAt).not.toBeNull();
  });

  it('o feed de uma imobiliária nunca leva anúncio de outra', async () => {
    const pathOutra = await prepararImobiliaria(outra);
    const daOutra = await criarAnuncio(outra);
    expect((await publicar(outra, daOutra.listingId)).status).toBe(201);
    const nosso = await buscar(feedPath, BROWSER);
    expect(nosso.body).not.toContain(daOutra.listingId);
    const deles = await buscar(pathOutra, BROWSER);
    expect(deles.body).toContain(daOutra.listingId);
  });

  it('token desconhecido, malformado ou revogado e conexão desligada dão o mesmo 404', async () => {
    expect((await buscar('/integrations/grupo-olx/feed/naoexiste.xml', CRAWLER)).statusCode).toBe(
      404,
    );
    const falso = `/integrations/grupo-olx/feed/${'A'.repeat(43)}.xml`;
    expect((await buscar(falso, CRAWLER)).statusCode).toBe(404);

    const temporaria = await registerAgency(app);
    await approveAgency(app, temporaria.org.id);
    const caminho = await prepararImobiliaria(temporaria);
    expect((await buscar(caminho, CRAWLER)).statusCode).toBe(200);
    await fx.ligarConexao(temporaria, false);
    expect((await buscar(caminho, CRAWLER)).statusCode).toBe(404);
    const revogado = await call(app, 'DELETE', '/integrations/grupo-olx/feed-token', {
      cookie: temporaria.cookie,
    });
    expect(revogado.status).toBe(200);
    expect((await buscar(caminho, CRAWLER)).statusCode).toBe(404);
  });

  it('remover: sai do arquivo na hora; vira REMOVED quando o robô busca sem ele', async () => {
    const nunca = await criarAnuncio(agencia);
    await publicar(agencia, nunca.listingId);
    const direto = await call(
      app,
      'POST',
      `/listings/${nunca.listingId}/channels/grupoolx/remove`,
      {
        cookie: agencia.cookie,
        payload: {},
      },
    );
    expect((direto.body.publication as { status: string }).status, 'nunca foi ao robô').toBe(
      'REMOVED',
    );

    const levado = await criarAnuncio(agencia);
    await publicar(agencia, levado.listingId);
    await buscar(feedPath, CRAWLER);
    expect((await estado(levado.listingId))?.status).toBe('AWAITING_IMPORT');
    const saindo = await call(
      app,
      'POST',
      `/listings/${levado.listingId}/channels/grupoolx/remove`,
      {
        cookie: agencia.cookie,
        payload: {},
      },
    );
    expect((saindo.body.publication as { status: string }).status).toBe('REMOVING');
    const semEle = await buscar(feedPath, CRAWLER);
    expect(semEle.body).not.toContain(levado.listingId);
    expect((await estado(levado.listingId))?.status).toBe('REMOVED');
  });

  it('foto: JPG do feed sai com os bytes e cache longo; versão errada, PNG e fora do feed dão 404', async () => {
    const comPng = await criarAnuncio(agencia, { fotos: 6, fotoPng: true });
    await publicar(agencia, comPng.listingId);
    const xml = (await buscar(feedPath, BROWSER)).body;
    const trecho = xml.slice(xml.indexOf(`<ListingID>${comPng.listingId}`));
    const urls = [
      ...trecho.slice(0, trecho.indexOf('</Listing>')).matchAll(/<Item[^>]*>([^<]+)<\/Item>/g),
    ].map((m) => m[1] ?? '');
    expect(urls, 'a PNG fica fora; as 5 JPG vão').toHaveLength(5);
    const caminho = new URL(urls[0] ?? '').pathname;
    const foto = await app.inject({ method: 'GET', url: caminho });
    expect(foto.statusCode).toBe(200);
    expect(foto.headers['content-type']).toBe('image/jpeg');
    expect(foto.headers['cache-control']).toContain('immutable');
    expect(foto.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    const versaoErrada = caminho.replace(/[0-9a-f]{16}\.jpg$/, '0000000000000000.jpg');
    expect((await app.inject({ method: 'GET', url: versaoErrada })).statusCode).toBe(404);

    const foraDoFeed = await criarAnuncio(agencia);
    // Foto de anúncio que não está no Grupo OLX: a rota não serve.
    const midias = await db.execute(
      sql`select id from property_media where property_id = ${foraDoFeed.propertyId} limit 1`,
    );
    const midiaId = String((midias.rows[0] as { id: string } | undefined)?.id);
    const fora = await app.inject({
      method: 'GET',
      url: `/integrations/grupo-olx/media/${midiaId}/0123456789abcdef.jpg`,
    });
    expect(fora.statusCode).toBe(404);
  });

  it('prévia para o validador oficial: arquivo inteiro, sem contar busca nem mexer em estado', async () => {
    const antes = await db
      .select()
      .from(channelFeedFetches)
      .where(eq(channelFeedFetches.orgId, agencia.org.id));
    const previa = await app.inject({
      method: 'GET',
      url: '/integrations/grupo-olx/feed-preview.xml',
      headers: { cookie: agencia.cookie },
    });
    expect(previa.statusCode).toBe(200);
    expect(previa.headers['content-disposition']).toContain('grupo-olx-vrsync.xml');
    expect(previa.body).toContain('</ListingDataFeed>');
    const depois = await db
      .select()
      .from(channelFeedFetches)
      .where(eq(channelFeedFetches.orgId, agencia.org.id));
    expect(depois).toHaveLength(antes.length);
  });

  it('mudar o anúncio reenfileira a reavaliação e o worker bloqueia com o motivo', async () => {
    const { listingId } = await criarAnuncio(agencia);
    await publicar(agencia, listingId);
    expect((await estado(listingId))?.status).toBe('ELIGIBLE');
    const curta = await call(app, 'PATCH', `/listings/${listingId}`, {
      cookie: agencia.cookie,
      payload: { description: 'Curta.' },
    });
    expect(curta.status).toBe(200);
    const jobs = await db
      .select()
      .from(channelSyncJobs)
      .where(
        and(eq(channelSyncJobs.listingId, listingId), eq(channelSyncJobs.channel, 'grupoolx')),
      );
    expect(jobs.map((j) => j.jobType)).toContain('UPDATE');
    await runChannelJobs({ db, adapterFor: () => null, limit: 50 });
    const depois = await estado(listingId);
    expect(depois?.status).toBe('BLOCKED');
    expect((depois?.issues as Array<{ code: string }>).map((i) => i.code)).toContain(
      'DESCRIPTION_LENGTH',
    );
  });

  it('lista da tela traz cada anúncio com o estado e os motivos', async () => {
    const res = await call(app, 'GET', '/integrations/grupo-olx/listings?status=BLOCKED', {
      cookie: agencia.cookie,
    });
    expect(res.status).toBe(200);
    const itens = res.body.items as Array<{ status: string; issues: Array<{ blocking: boolean }> }>;
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((i) => i.status === 'BLOCKED' && i.issues.some((x) => x.blocking))).toBe(
      true,
    );
  });
});

describe('Grupo OLX — instalação sem endereço público da API', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id);
  });

  it('sem API_PUBLIC_URL não há URL de feed para gerar, e a tela avisa', async () => {
    const token = await call(app, 'POST', '/integrations/grupo-olx/feed-token', {
      cookie: agencia.cookie,
    });
    expect(token.status).toBe(409);
    const visao = await call(app, 'GET', '/integrations/grupo-olx', { cookie: agencia.cookie });
    expect(visao.body.installation).toEqual({
      feedAvailable: false,
      leadsWebhookConfigured: false,
    });
    expect((visao.body.warnings as Array<{ code: string }>).map((w) => w.code)).toEqual(
      expect.arrayContaining([
        'API_PUBLIC_URL_MISSING',
        'CONTACT_EMAIL_MISSING',
        'LEADS_SECRET_MISSING',
      ]),
    );
  });

  it('a rota do feed responde 503 em vez de montar URL errada', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/integrations/grupo-olx/feed/${'A'.repeat(43)}.xml`,
    });
    expect(res.statusCode).toBe(503);
  });
});
