import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '@aluguei/api';
import { createTestDb } from '@aluguei/db';
import {
  AutentiqueSignatureProvider,
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
 * P1-11, parte interna (auditoria 2026-09-10), agora com a Autentique (decisão do dono em
 * 01/10/2026, no lugar da Clicksign): o envelope leva o provider configurado, o documento é o PDF
 * gerado do texto da versão enviada e cada parte vira um signatário por e-mail. O webhook da
 * Autentique (HMAC do corpo cru) localiza o envelope pelo documento e a parte pelo `public_id`.
 * Sem chamada real: o adapter usa fetch simulado.
 */

const AUTENTIQUE_ENDPOINT = 'https://autentique.test/v2/graphql';
const WEBHOOK_SECRET = 'segredo-de-teste';

interface CreateCall {
  authorization: string | undefined;
  query: string;
  variables: {
    document: { name: string };
    signers: Array<{ email: string; action: string }>;
    file: null;
  };
  file: File | null;
}

interface EnvelopeDto {
  provider: string;
  providerEnvelopeId: string;
  contractVersion: number | null;
  documentHash?: string | null;
}

/** Autentique simulada: `createDocument` devolve uma assinatura por signatário, na ordem enviada. */
function simulatedAutentique() {
  const calls: CreateCall[] = [];
  let documents = 0;
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body;
    if (url !== AUTENTIQUE_ENDPOINT || !(body instanceof FormData)) {
      return Promise.resolve(
        new Response(JSON.stringify({ errors: [{ message: 'rota inesperada' }] }), {
          status: 500,
        }),
      );
    }
    const operations = JSON.parse(body.get('operations') as string) as Pick<
      CreateCall,
      'query' | 'variables'
    >;
    const file = body.get('file');
    calls.push({
      authorization: (init?.headers as Record<string, string> | undefined)?.['authorization'],
      ...operations,
      file: file instanceof File ? file : null,
    });
    documents += 1;
    const id = `doc-${String(documents)}`;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: {
            createDocument: {
              id,
              signatures: operations.variables.signers.map((signer, index) => ({
                public_id: `${id}-sig-${String(index + 1)}`,
                email: signer.email,
              })),
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  };
  return { calls, fetchImpl };
}

describe('Autentique: envelope com o PDF do contrato e webhook assinado (P1-11)', () => {
  let app: FastifyInstance;
  let fx: ReturnType<typeof createContractFixtures>;
  const autentique = simulatedAutentique();
  const provider = new AutentiqueSignatureProvider({
    token: 'token-de-teste',
    sandbox: true,
    endpoint: AUTENTIQUE_ENDPOINT,
    fetchImpl: autentique.fetchImpl,
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
      env: { ...testEnv, AUTENTIQUE_WEBHOOK_SECRET: WEBHOOK_SECRET },
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

  /** Webhook como a Autentique manda: corpo JSON e HMAC-SHA256 hex no `x-autentique-signature`. */
  async function autentiqueWebhook(
    event: Record<string, unknown>,
    secret = WEBHOOK_SECRET,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const payload = JSON.stringify({ id: 'd2ViaG9vaw==', object: 'webhook', event });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/signature/autentique',
      headers: {
        'content-type': 'application/json',
        'x-autentique-signature': createHmac('sha256', secret).update(payload).digest('hex'),
      },
      payload,
    });
    return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
  }

  it('envelope gravado com o provider AUTENTIQUE, o PDF da versão e cada parte por e-mail', async () => {
    const contract = await fx.generatedContract({ rentCents: 250_000, emails: true });
    const generated = await fx.contractRow(contract.contractId);
    const envelope = await send(contract.contractId, contract.cookie);
    expect(envelope).toMatchObject({ provider: 'AUTENTIQUE', contractVersion: 1 });
    expect(envelope.providerEnvelopeId).toMatch(/^doc-\d+$/);

    const call = autentique.calls.at(-1);
    expect(call?.authorization).toBe('Bearer token-de-teste');
    expect(call?.query).toContain('createDocument(sandbox: true,');
    expect(call?.variables.document).toEqual({ name: 'Contrato de locação · versão 1' });
    expect(call?.variables.signers.map((signer) => signer.email).sort()).toEqual(
      [contract.emails.landlord, contract.emails.tenant].sort(),
    );
    expect(call?.variables.signers.every((signer) => signer.action === 'SIGN')).toBe(true);
    // Do cadastro só sai o e-mail: o nome e o CPF a pessoa informa ao assinar.
    expect(JSON.stringify(call?.variables)).not.toMatch(
      /Proprietária Contrato|Locatária Contrato|11144477735|52998224725/,
    );

    expect(call?.file?.name).toBe(`contrato-${contract.contractId}.pdf`);
    const pdf = Buffer.from((await call?.file?.arrayBuffer()) ?? new ArrayBuffer(0));
    // O PDF enviado é exatamente o documento gerado do texto da versão 1.
    const expected = await renderContractPdf({
      contractId: contract.contractId,
      version: 1,
      content: generated.content ?? '',
      contentHash: generated.content_hash ?? '',
    });
    expect(pdf.equals(Buffer.from(expected))).toBe(true);
    expect(envelope.documentHash).toBe(createHash('sha256').update(pdf).digest('hex'));
  });

  it('parte sem e-mail no cadastro: 400 e nenhuma chamada à Autentique', async () => {
    const contract = await fx.generatedContract();
    const before = autentique.calls.length;

    const res = await fx.call('POST', `/contracts/${contract.contractId}/send-for-signature`, {
      cookie: contract.cookie,
      payload: {},
    });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Cadastre o e-mail');
    expect(autentique.calls.length).toBe(before);
    expect((await fx.contractRow(contract.contractId)).status).toBe('GENERATED');
  });

  it('webhook: HMAC errado é 401; o aceite avança a parte; o documento concluído assina o contrato', async () => {
    const contract = await fx.generatedContract({ emails: true });
    const envelope = await send(contract.contractId, contract.cookie);
    const documentId = envelope.providerEnvelopeId;
    const assinadoEm = '2026-10-01T12:00:00.000000Z';
    const aceite = {
      id: `evt-aceite-${fx.uniq()}`,
      object: 'event',
      organization: 1,
      type: 'signature.accepted',
      data: {
        public_id: `${documentId}-sig-1`,
        object: 'signature',
        document: documentId,
        signed: assinadoEm,
      },
    };

    const forjado = await autentiqueWebhook(aceite, 'outro-segredo');
    expect(forjado.status).toBe(401);

    const primeiro = await autentiqueWebhook(aceite);
    expect(primeiro.status, JSON.stringify(primeiro.body)).toBe(200);
    expect(primeiro.body).toEqual({ status: 'queued' });
    await worker();
    expect((await fx.contractRow(contract.contractId)).status).toBe('PARTIALLY_SIGNED');

    // A Autentique pode repetir o evento com outro id: a chave é a assinatura, e nada muda.
    const repetido = await autentiqueWebhook({ ...aceite, id: `evt-repetido-${fx.uniq()}` });
    expect(repetido.status).toBe(200);
    await worker();
    expect((await fx.contractRow(contract.contractId)).status).toBe('PARTIALLY_SIGNED');

    const concluido = await autentiqueWebhook({
      id: `evt-fim-${fx.uniq()}`,
      object: 'event',
      organization: 1,
      type: 'document.finished',
      data: {
        id: documentId,
        object: 'document',
        signatures: [
          { public_id: `${documentId}-sig-1`, signed: assinadoEm },
          { public_id: `${documentId}-sig-2`, signed: assinadoEm },
        ],
      },
    });
    expect(concluido.status, JSON.stringify(concluido.body)).toBe(200);
    await worker();
    expect((await fx.contractRow(contract.contractId)).status).toBe('SIGNED');
  });

  it('webhook de documento de fora ou de evento que não muda o envelope responde 200 sem efeito', async () => {
    const externo = await autentiqueWebhook({
      id: `evt-externo-${fx.uniq()}`,
      object: 'event',
      organization: 1,
      type: 'document.finished',
      data: { id: 'doc-de-outro-sistema', object: 'document', signatures: [] },
    });
    expect(externo).toEqual({ status: 200, body: { status: 'ignored' } });

    const visto = await autentiqueWebhook({
      id: `evt-visto-${fx.uniq()}`,
      object: 'event',
      organization: 1,
      type: 'signature.viewed',
      data: { public_id: 'qualquer', object: 'signature', document: 'doc-1' },
    });
    expect(visto).toEqual({ status: 200, body: { status: 'ignored' } });

    const invalido = await autentiqueWebhook({ type: 'signature.accepted' });
    expect(invalido.status).toBe(400);
  });
});
