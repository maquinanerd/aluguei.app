import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '@aluguei/api';
import { createTestDb } from '@aluguei/db';
import {
  ClicksignSignatureProvider,
  FakeChannel,
  FakeMetaAdsProvider,
  FakePaymentProvider,
  FakeScreeningProvider,
  FakeWhatsAppMessenger,
  MockAiProvider,
  renderContractPdf,
} from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { FakeStorageService } from './fakes.js';
import { testEnv } from './helpers.js';
import { createContractFixtures } from './contract-fixtures.js';

/**
 * P1-11, parte interna (auditoria 2026-09-10): o envelope era gravado com
 * provider 'FAKE' fixo e o "documento" enviado era o hash do conteúdo. Com a
 * Clicksign configurada o adapter recusava o documento e, mesmo que aceitasse,
 * o webhook — que localiza o envelope por provider + id — nunca casaria.
 * Regra: o envelope leva o provider configurado e o documento é o PDF gerado do
 * texto da versão enviada. Sem chamada real: o adapter usa fetch simulado.
 */

const CLICKSIGN_BASE = 'https://clicksign.test/api/v3';

interface RecordedCall {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
  url: string;
}

interface EnvelopeDto {
  provider: string;
  providerEnvelopeId: string;
  contractVersion: number | null;
  documentHash?: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/vnd.api+json' },
  });
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

/** Clicksign v3 simulada: envelope → documento → signatários → requisitos → ativação. */
function simulatedClicksign() {
  const calls: RecordedCall[] = [];
  let envelopes = 0;
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    const path = url.startsWith(CLICKSIGN_BASE) ? url.slice(CLICKSIGN_BASE.length) : url;
    calls.push({ method, path, body, url });
    if (!url.startsWith(CLICKSIGN_BASE)) {
      return Promise.resolve(
        jsonResponse({ errors: [{ detail: `host inesperado: ${url}` }] }, 500),
      );
    }
    if (method === 'POST' && path === '/envelopes') {
      envelopes += 1;
      return Promise.resolve(
        jsonResponse(
          { data: { id: `env-cs-${String(envelopes)}`, type: 'envelopes', attributes: {} } },
          201,
        ),
      );
    }
    const match = /^\/envelopes\/([^/]+)(?:\/(documents|signers|requirements))?$/.exec(path);
    const envelopeId = match?.[1];
    const child = match?.[2];
    if (envelopeId && method === 'POST' && child) {
      return Promise.resolve(
        jsonResponse(
          { data: { id: `${child}-${String(calls.length)}`, type: child, attributes: {} } },
          201,
        ),
      );
    }
    if (envelopeId && method === 'PATCH' && !child) {
      return Promise.resolve(
        jsonResponse({
          data: { id: envelopeId, type: 'envelopes', attributes: { status: 'running' } },
        }),
      );
    }
    return Promise.resolve(
      jsonResponse({ errors: [{ detail: `rota inesperada: ${method} ${path}` }] }, 500),
    );
  };
  return { calls, fetchImpl };
}

describe('P1-11 (interno): envelope com o provider configurado e PDF do contrato', () => {
  let app: FastifyInstance;
  let fx: ReturnType<typeof createContractFixtures>;
  const clicksign = simulatedClicksign();
  const provider = new ClicksignSignatureProvider({
    token: 'token-de-teste',
    baseUrl: CLICKSIGN_BASE,
    fetchImpl: clicksign.fetchImpl,
  });
  const screening = new FakeScreeningProvider();
  const payments = new FakePaymentProvider();

  function worker() {
    return runInboxJobs({ db: app.db, limit: 50, screening, signature: provider, payments });
  }

  beforeAll(async () => {
    const db = await createTestDb();
    app = await buildApp({
      db,
      env: testEnv,
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      channels: { fake: new FakeChannel() },
      whatsapp: new FakeWhatsAppMessenger('verify-token-p1-11'),
      ai: new MockAiProvider(),
      signature: provider,
      payments,
      meta: new FakeMetaAdsProvider(),
    });
    fx = createContractFixtures(app, worker);
  });

  afterAll(async () => {
    await app.close();
  });

  async function send(contractId: string, cookie: string): Promise<EnvelopeDto> {
    const res = await fx.call('POST', `/contracts/${contractId}/send-for-signature`, {
      cookie,
      payload: {},
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.envelope as EnvelopeDto;
  }

  it('envelope gravado com o provider configurado (CLICKSIGN) e o PDF da versão enviada', async () => {
    const contract = await fx.generatedContract({ rentCents: 250_000 });
    const generated = await fx.contractRow(contract.contractId);
    const envelope = await send(contract.contractId, contract.cookie);
    expect(envelope).toMatchObject({ provider: 'CLICKSIGN', contractVersion: 1 });
    expect(envelope.providerEnvelopeId).toMatch(/^env-cs-\d+$/);

    const upload = clicksign.calls.find(
      (call) =>
        call.method === 'POST' &&
        call.path === `/envelopes/${envelope.providerEnvelopeId}/documents`,
    );
    const attributes = (
      upload?.body?.['data'] as
        { attributes?: { filename?: string; content_base64?: string } } | undefined
    )?.attributes;
    expect(attributes?.filename).toBe(`contrato-${contract.contractId}.pdf`);
    const pdf = Buffer.from(attributes?.content_base64 ?? '', 'base64');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // O PDF enviado é exatamente o documento gerado do texto da versão 1.
    const expected = await renderContractPdf({
      contractId: contract.contractId,
      version: 1,
      content: generated.content ?? '',
      contentHash: generated.content_hash ?? '',
    });
    expect(pdf.equals(Buffer.from(expected))).toBe(true);
    expect(envelope.documentHash).toBe(createHash('sha256').update(pdf).digest('hex'));

    // Nenhuma chamada saiu do host simulado.
    expect(clicksign.calls.every((call) => call.url.startsWith(CLICKSIGN_BASE))).toBe(true);
  });

  it('webhook com provider CLICKSIGN localiza o envelope e o worker avança a assinatura', async () => {
    const contract = await fx.generatedContract();
    const envelope = await send(contract.contractId, contract.cookie);
    const res = await fx.call('POST', '/webhooks/signature', {
      payload: {
        provider: 'CLICKSIGN',
        eventType: 'SIGNER_SIGNED',
        providerEventId: `cs-evt-${fx.uniq()}`,
        providerEnvelopeId: envelope.providerEnvelopeId,
        signerOrder: 1,
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ status: 'queued' });
    await worker();
    expect((await fx.contractRow(contract.contractId)).status).toBe('PARTIALLY_SIGNED');
  });
});
