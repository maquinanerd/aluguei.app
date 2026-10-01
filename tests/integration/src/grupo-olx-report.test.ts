import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { channelConnections, channelImportReports } from '@aluguei/db';
import { grupoOlxAuthorizationHeader } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';
import { API_PUBLIC_URL, CRAWLER, MemoryStorage, grupoOlxFixtures } from './grupo-olx-fixtures.js';
import type { GrupoOlxFixtures } from './grupo-olx-fixtures.js';

/**
 * Relatório de importação do Grupo OLX (ADR-108): é a evidência do que o portal fez com cada
 * anúncio. Entrar no XML deixa o anúncio "aguardando relatório"; o relatório é que diz importado,
 * importado com aviso ou recusado. Webhook separado do lead, histórico guardado, idempotente.
 */

const SECRET = 'chave-de-teste-do-grupo-olx-123456';
let numero = 0;

function relatorio(
  errors: Array<{ errorMessage: string; externalIds: string[] }>,
  warnings: Array<{ message: string; externalIds: string[] }>,
  date?: string,
) {
  numero += 1;
  return {
    id: `relatorio-${String(Date.now())}-${String(numero)}`,
    company: 'ZAP_OLX',
    type: 'FEEDS_INTEGRATION_REPORT',
    description: 'Resumo da importação',
    details: {
      // Sem fuso, como o exemplo oficial: horário de Brasília.
      date: date ?? '2099-01-01T00:00:00',
      total: 200,
      updated: 1,
      created: 2,
      deleted: 0,
      unchanged: 0,
      error: errors.length,
      warning: warnings.length,
    },
    link: 'https://grupozap.example/report.html',
    errors: errors.map((e) => ({ ...e, listingsQuantity: e.externalIds.length })),
    warnings: warnings.map((w) => ({ ...w, listingsQuantity: String(w.externalIds.length) })),
  };
}

describe('Grupo OLX — relatório de importação (ADR-108)', () => {
  let app: FastifyInstance;
  let fx: GrupoOlxFixtures;
  let agencia: RegisteredAgency;
  let feedPath: string;
  /** URL por imobiliária: relatório limpo (sem crítica) só tem dono por ela. */
  let refPath: string;

  async function postar(payload: object, path = '/integrations/grupo-olx/reports') {
    return app.inject({
      method: 'POST',
      url: path,
      headers: {
        'content-type': 'application/json',
        authorization: grupoOlxAuthorizationHeader(SECRET),
      },
      payload: JSON.stringify(payload),
    });
  }

  async function noFeed(): Promise<string> {
    const { listingId } = await fx.criarAnuncio(agencia);
    expect((await fx.publicar(agencia, listingId)).status).toBe(201);
    return listingId;
  }

  beforeAll(async () => {
    const storage = new MemoryStorage();
    app = await buildTestApp({
      env: { API_PUBLIC_URL, GRUPO_OLX_LEADS_SECRET_KEY: SECRET },
      storage,
    });
    fx = grupoOlxFixtures(app, storage);
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id);
    feedPath = await fx.prepararImobiliaria(agencia);
    const [conexao] = await fx.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.orgId, agencia.org.id));
    refPath = `/integrations/grupo-olx/reports/${conexao?.leadsEndpointRef ?? ''}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('crítica, aviso e silêncio viram recusado, importado com aviso e importado', async () => {
    const recusado = await noFeed();
    const comAviso = await noFeed();
    const limpo = await noFeed();
    const naoBuscado = await noFeed();
    await fx.buscar(feedPath, CRAWLER);
    // Publicado depois da busca: o relatório não fala dele.
    const depois = await noFeed();
    expect(naoBuscado).toBeDefined();

    const res = await postar(
      relatorio(
        [
          {
            errorMessage: 'O campo imagens é obrigatório',
            externalIds: [`${recusado} `, 'AP0511', depois],
          },
        ],
        [{ message: 'O campo addressNumber não está preenchido', externalIds: [comAviso] }],
      ),
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await runInboxJobs({ db: fx.db, limit: 20 });

    const r = await fx.estado(recusado);
    expect(r?.status).toBe('IMPORT_ERROR');
    expect(r?.issues).toEqual(
      expect.arrayContaining([
        { code: 'REPORT_ERROR', message: 'O campo imagens é obrigatório', blocking: true },
      ]),
    );
    expect(r?.lastReportAt).not.toBeNull();
    expect((await fx.estado(comAviso))?.status).toBe('IMPORTED_WITH_WARNINGS');
    expect((await fx.estado(limpo))?.status).toBe('IMPORTED');
    expect((await fx.estado(depois))?.status, 'o robô ainda não levou: segue elegível').toBe(
      'ELIGIBLE',
    );

    const [guardado] = await fx.db
      .select()
      .from(channelImportReports)
      .where(eq(channelImportReports.orgId, agencia.org.id));
    expect(guardado).toMatchObject({ company: 'ZAP_OLX', contracted: 200, errorCount: 1 });
    expect(guardado?.reportDate?.toISOString()).toBe('2099-01-01T03:00:00.000Z');
    const [conexao] = await fx.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.orgId, agencia.org.id));
    expect(conexao?.lastErrorCode).toBe('IMPORT_REPORT_ERRORS');
    expect(conexao?.lastReportAt).not.toBeNull();

    const visao = await call(app, 'GET', '/integrations/grupo-olx', { cookie: agencia.cookie });
    expect((visao.body.lastReport as { errors: number }).errors).toBe(1);
    expect((visao.body.counts as { importErrors: number }).importErrors).toBeGreaterThanOrEqual(1);
  });

  it('o mesmo relatório duas vezes: 2xx nas duas, aplicado uma vez', async () => {
    const id = await noFeed();
    await fx.buscar(feedPath, CRAWLER);
    const payload = relatorio([{ errorMessage: 'Erro qualquer', externalIds: [id] }], []);
    expect((await postar(payload)).json()).toEqual({ ok: true });
    expect((await postar(payload)).json()).toEqual({ ok: true, duplicate: true });
    await runInboxJobs({ db: fx.db, limit: 20 });
    const guardados = await fx.db
      .select()
      .from(channelImportReports)
      .where(eq(channelImportReports.externalReportId, payload.id));
    expect(guardados).toHaveLength(1);
  });

  it('versão nova do anúncio volta a "aguardando"; sem mudança, fica o que o relatório disse', async () => {
    const id = await noFeed();
    await fx.buscar(feedPath, CRAWLER);
    expect((await postar(relatorio([], []), refPath)).statusCode).toBe(200);
    await runInboxJobs({ db: fx.db, limit: 20 });
    expect((await fx.estado(id))?.status).toBe('IMPORTED');

    await fx.buscar(feedPath, CRAWLER);
    expect((await fx.estado(id))?.status, 'mesma versão: continua importado').toBe('IMPORTED');

    const titulo = await call(app, 'PATCH', `/listings/${id}`, {
      cookie: agencia.cookie,
      payload: { title: 'Apartamento reformado com 2 quartos no Setor Bueno' },
    });
    expect(titulo.status).toBe(200);
    await fx.buscar(feedPath, CRAWLER);
    expect((await fx.estado(id))?.status, 'versão nova levada: aguarda relatório').toBe(
      'AWAITING_IMPORT',
    );
  });

  it('relatório sem crítica e sem URL por imobiliária não tem dono: 422', async () => {
    const res = await postar(relatorio([], []));
    // Os anteriores citaram anúncios; este não cita ninguém.
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'ADVERTISER_NOT_FOUND' });
  });

  it('pela URL por imobiliária, o relatório limpo encontra o dono; referência falsa, 404', async () => {
    expect((await postar(relatorio([], []), refPath)).statusCode).toBe(200);
    expect(
      (await postar(relatorio([], []), '/integrations/grupo-olx/reports/nao-existe')).statusCode,
    ).toBe(404);
  });

  it('tipo desconhecido e payload sem id são recusados', async () => {
    const outroTipo = { ...relatorio([], []), type: 'OUTRA_COISA' };
    expect((await postar(outroTipo)).statusCode).toBe(400);
    const { id: _ignorado, ...semId } = relatorio([], []);
    expect((await postar(semId)).statusCode).toBe(400);
  });
});
