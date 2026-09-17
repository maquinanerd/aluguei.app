import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AppDb } from '@aluguei/db';
import type { ReadableSpan, Telemetry } from '@aluguei/observability';

/**
 * P2-11 (auditoria 2026-09-10): spans de HTTP (Fastify) e de pg na API e no worker, provados
 * com exportador em memória contra PostgreSQL real — o PGlite não usa o driver `pg`. A
 * telemetria sobe antes de carregar API, worker e banco (import dinâmico), como nos pontos de
 * entrada: os instrumentadores só enxergam módulos carregados depois. Exige TEST_DATABASE_URL.
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

const SPAN_KIND_SERVER = 1;

describe('OTEL com exportador em memória (PostgreSQL real)', () => {
  const dbName = `aluguei_ot_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let telemetry: Telemetry;
  let exporter: { getFinishedSpans(): ReadableSpan[]; reset(): void };
  let admin: AppDb;
  let db: AppDb;
  let app: FastifyInstance;

  beforeAll(async () => {
    const observability = await import('@aluguei/observability');
    const memory = new observability.InMemorySpanExporter();
    exporter = memory;
    telemetry = observability.startTelemetry({
      serviceName: 'aluguei-api',
      environment: 'test',
      spanExporter: memory,
      simpleProcessor: true,
    });

    const { createDb } = await import('@aluguei/db');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const { sql } = await import('drizzle-orm');
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: MIGRATIONS });

    const { buildApp } = await import('@aluguei/api');
    const { testEnv } = await import('./helpers.js');
    app = await buildApp({ db, env: testEnv, config: { cookieSecure: false } });
    await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await app.close();
    await db.$client.end();
    const { dropTestDatabase } = await import('./pg-test-database.js');
    await dropTestDatabase(admin, dbName);
    await admin.$client.end();
    await telemetry.shutdown();
  });

  it('API: request HTTP gera span de servidor com a rota do Fastify e a query pg é filha dele', async () => {
    exporter.reset();
    const { port } = app.server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${String(port)}/health/ready`);
    expect(res.status).toBe(200);
    await telemetry.forceFlush();

    const spans = exporter.getFinishedSpans();
    const names = JSON.stringify(spans.map((span) => span.name));
    const server = spans.find(
      (span) => span.kind === SPAN_KIND_SERVER && span.attributes['url.path'] === '/health/ready',
    );
    expect(server, names).toBeDefined();
    expect(server?.name).toBe('GET /health/ready');
    expect(server?.attributes['http.route']).toBe('/health/ready');
    expect(server?.attributes['http.response.status_code']).toBe(200);

    // Entre os spans de pg do mesmo trace (há também o `pg-pool.connect`), o da query.
    const query = spans.find(
      (span) =>
        span.name.startsWith('pg.query') &&
        span.attributes['db.system.name'] === 'postgresql' &&
        span.spanContext().traceId === server?.spanContext().traceId,
    );
    expect(query, names).toBeDefined();
    expect(query?.attributes['db.namespace']).toBe(dbName);
  });

  it('worker: job gera span com fila, id e tentativa, e as queries do job são filhas dele', async () => {
    const { sql } = await import('drizzle-orm');
    const { organizations, webhookInbox } = await import('@aluguei/db');
    const { FakePaymentProvider } = await import('@aluguei/integrations');
    const { runInboxJobs } = await import('@aluguei/worker');

    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org OTEL', slug: `org-otel-${dbName}` })
      .returning();
    if (!org) {
      throw new Error('org seed failed');
    }
    const [job] = await db
      .insert(webhookInbox)
      .values({
        orgId: org.id,
        provider: 'PAYMENT',
        providerEventId: `otel:${dbName}`,
        payload: {},
      })
      .returning();
    if (!job) {
      throw new Error('inbox seed failed');
    }
    exporter.reset();
    await runInboxJobs({ db, limit: 50, payments: new FakePaymentProvider() });
    await telemetry.forceFlush();

    const spans = exporter.getFinishedSpans();
    const names = JSON.stringify(spans.map((span) => span.name));
    const jobSpan = spans.find((span) => span.attributes['job.id'] === job.id);
    expect(jobSpan, names).toBeDefined();
    expect(jobSpan?.name).toBe('job PAYMENT');
    expect(jobSpan?.attributes['job.queue']).toBe('inbox');
    expect(jobSpan?.attributes['job.attempt']).toBe(1);

    const childQueries = spans.filter(
      (span) =>
        span.attributes['db.system.name'] === 'postgresql' &&
        span.spanContext().traceId === jobSpan?.spanContext().traceId,
    );
    expect(childQueries.length, names).toBeGreaterThan(0);
    const [status] = (await db.execute(sql`select status from webhook_inbox where id = ${job.id}`))
      .rows as Array<{ status: string }>;
    expect(status?.status).toBe('SUCCESS');
  });
});
