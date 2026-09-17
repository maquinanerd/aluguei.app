import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { dropTestDatabase } from './pg-test-database.js';

/**
 * Spans visíveis num coletor local (G3, aceite da Trilha F): API e worker rodam como na
 * homologação (`node --import tsx <ponto de entrada>`) com OTEL_EXPORTER_OTLP_ENDPOINT apontando
 * para um coletor OTLP/HTTP (JSON) desta suíte. Prova a ordem de carga dos pontos de entrada
 * (telemetria antes do app) e o caminho /v1/traces a partir da base do endpoint.
 * Exige TEST_DATABASE_URL.
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

interface OtlpValue {
  stringValue?: string;
  intValue?: number | string;
}
interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  attributes?: Array<{ key: string; value: OtlpValue }>;
}
interface CollectedSpan extends OtlpSpan {
  service: string;
  attr: Record<string, string | number | undefined>;
}
interface OtlpTraces {
  resourceSpans?: Array<{
    resource?: { attributes?: Array<{ key: string; value: OtlpValue }> };
    scopeSpans?: Array<{ spans?: OtlpSpan[] }>;
  }>;
}

function flatten(attributes: Array<{ key: string; value: OtlpValue }> | undefined) {
  const out: Record<string, string | number | undefined> = {};
  for (const { key, value } of attributes ?? []) {
    out[key] =
      value.stringValue ?? (value.intValue === undefined ? undefined : Number(value.intValue));
  }
  return out;
}

async function startCollector(): Promise<{
  server: Server;
  url: string;
  spans: CollectedSpan[];
  paths: string[];
}> {
  const spans: CollectedSpan[] = [];
  const paths: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      paths.push(req.url ?? '');
      if (req.url === '/v1/traces') {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as OtlpTraces;
        for (const resourceSpans of body.resourceSpans ?? []) {
          const service = String(flatten(resourceSpans.resource?.attributes)['service.name']);
          for (const scope of resourceSpans.scopeSpans ?? []) {
            for (const span of scope.spans ?? []) {
              spans.push({ ...span, service, attr: flatten(span.attributes) });
            }
          }
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${String(port)}`, spans, paths };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return true;
    }
    await sleep(200);
  }
  return false;
}

function startProcess(
  entry: string,
  env: NodeJS.ProcessEnv,
): { child: ChildProcess; output: () => string } {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  delete childEnv.REDIS_URL;
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    cwd: ROOT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) => {
    child.on('exit', () => {
      resolve();
    });
  });
  child.kill();
  await exited;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

describe('spans num coletor OTLP local (API e worker como processos reais)', () => {
  const dbName = `aluguei_oc_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let admin: AppDb;
  let collector: Awaited<ReturnType<typeof startCollector>>;

  const telemetryEnv = (): NodeJS.ProcessEnv => ({
    NODE_ENV: 'development',
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl(dbName),
    OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    // Lote curto: o processo é derrubado sem flush (no Windows, kill encerra na hora).
    OTEL_BSP_SCHEDULE_DELAY: '200',
  });

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    const db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await db.$client.end();
    collector = await startCollector();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      collector.server.close(() => {
        resolve();
      });
      collector.server.closeAllConnections();
    });
    await dropTestDatabase(admin, dbName);
    await admin.$client.end();
  });

  it('API: GET /health/ready chega ao coletor como span HTTP da rota com a query pg filha', async () => {
    const port = await freePort();
    const api = startProcess('apps/api/src/index.ts', {
      ...telemetryEnv(),
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
    });
    try {
      const ready = await waitFor(async () => {
        try {
          return (await fetch(`http://127.0.0.1:${String(port)}/health/ready`)).status === 200;
        } catch {
          return false;
        }
      }, 60_000);
      expect(ready, api.output()).toBe(true);

      const found = await waitFor(
        () =>
          collector.spans.some(
            (span) => span.service === 'aluguei-api' && span.attr['http.route'] === '/health/ready',
          ),
        15_000,
      );
      expect(found, `${JSON.stringify(collector.paths)}\n${api.output()}`).toBe(true);
      const server = collector.spans.find(
        (span) => span.service === 'aluguei-api' && span.attr['http.route'] === '/health/ready',
      );
      expect(server?.name).toBe('GET /health/ready');
      const hasQuery = await waitFor(
        () =>
          collector.spans.some(
            (span) =>
              span.traceId === server?.traceId && span.attr['db.system.name'] === 'postgresql',
          ),
        15_000,
      );
      expect(hasQuery, JSON.stringify(collector.spans.map((s) => s.name))).toBe(true);
      expect(collector.paths.every((path) => path === '/v1/traces')).toBe(true);
    } finally {
      await stop(api.child);
    }
  });

  it('worker: o ciclo de jobs chega ao coletor com as queries pg', async () => {
    const worker = startProcess('apps/worker/src/main.ts', telemetryEnv());
    try {
      const found = await waitFor(
        () =>
          collector.spans.some(
            (span) =>
              span.service === 'aluguei-worker' && span.attr['db.system.name'] === 'postgresql',
          ),
        60_000,
      );
      expect(found, `${JSON.stringify(collector.paths)}\n${worker.output()}`).toBe(true);
      const cycle = collector.spans.find(
        (span) => span.service === 'aluguei-worker' && span.name === 'worker.cycle',
      );
      expect(
        cycle,
        JSON.stringify(collector.spans.map((s) => `${s.service}:${s.name}`)),
      ).toBeDefined();
      expect(
        collector.spans.some(
          (span) => span.traceId === cycle?.traceId && span.attr['db.system.name'] === 'postgresql',
        ),
      ).toBe(true);
    } finally {
      await stop(worker.child);
    }
  });
});
