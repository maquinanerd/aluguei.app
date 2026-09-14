import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { ClicksignSignatureProvider, SignatureProviderError } from './clicksign.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/vnd.api+json' },
  });
}

const PDF_BASE64 = Buffer.from('%PDF-1.7\nfake document').toString('base64');

interface RouteCall {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

function recordCalls(fetchImpl: ReturnType<typeof vi.fn>): RouteCall[] {
  return fetchImpl.mock.calls.map((call) => {
    const [input, init] = call as [string | URL | Request, RequestInit | undefined];
    const method = (init?.method ?? 'GET').toUpperCase();
    return {
      method,
      path: new URL(urlOf(input)).pathname,
      body:
        init?.body === undefined
          ? undefined
          : (JSON.parse(init.body as string) as Record<string, unknown>),
    };
  });
}

function signerAttributes(call: RouteCall | undefined): {
  name: string;
  group: number;
} {
  const attributes = (call?.body?.['data'] as { attributes?: Record<string, unknown> } | undefined)
    ?.attributes;
  const name = attributes?.['name'];
  const group = attributes?.['group'];
  return {
    name: typeof name === 'string' ? name : '',
    group: typeof group === 'number' ? group : 0,
  };
}

function documentAttributes(call: RouteCall | undefined): {
  filename: string;
  contentBase64: string;
} {
  const attributes = (call?.body?.['data'] as { attributes?: Record<string, unknown> } | undefined)
    ?.attributes;
  const filename = attributes?.['filename'];
  const contentBase64 = attributes?.['content_base64'];
  return {
    filename: typeof filename === 'string' ? filename : '',
    contentBase64: typeof contentBase64 === 'string' ? contentBase64 : '',
  };
}

function relationshipIds(call: RouteCall | undefined): { documentId: string; signerId: string } {
  const relationships = (call?.body?.['data'] as Record<string, unknown> | undefined)?.[
    'relationships'
  ] as Record<string, Record<string, Record<string, string>>> | undefined;
  return {
    documentId: relationships?.['document']?.['data']?.['id'] ?? '',
    signerId: relationships?.['signer']?.['data']?.['id'] ?? '',
  };
}

/** Roteia o fluxo de criação do envelope (env-1/doc-1) com respostas JSON:API. */
function dispatchCreateEnvelope(url: string, init?: RequestInit): Response {
  if (url.endsWith('/api/v3/envelopes') && init?.method === 'POST') {
    return jsonResponse(
      { data: { id: 'env-1', type: 'envelopes', attributes: { status: 'draft' } } },
      201,
    );
  }
  if (url.endsWith('/envelopes/env-1/documents') && init?.method === 'POST') {
    return jsonResponse(
      { data: { id: 'doc-1', type: 'documents', attributes: { status: 'draft' } } },
      201,
    );
  }
  if (url.endsWith('/envelopes/env-1/signers') && init?.method === 'POST') {
    const body = JSON.parse(init.body as string) as { data: { attributes: { group: number } } };
    const id = body.data.attributes.group === 1 ? 'sig-1' : 'sig-2';
    return jsonResponse({ data: { id, type: 'signers', attributes: {} } }, 201);
  }
  if (url.endsWith('/envelopes/env-1/requirements') && init?.method === 'POST') {
    return jsonResponse({ data: { id: 'req-x', type: 'requirements', attributes: {} } }, 201);
  }
  if (url.endsWith('/envelopes/env-1') && init?.method === 'PATCH') {
    return jsonResponse({
      data: { id: 'env-1', type: 'envelopes', attributes: { status: 'running' } },
    });
  }
  return jsonResponse({ errors: [{ status: 500, detail: `unexpected ${url}` }] }, 500);
}

/** Roteia o cancelamento do envelope env-x (lista + PATCH do documento running). */
function dispatchCancelEnvelope(url: string, init?: RequestInit): Response {
  if (url.endsWith('/envelopes/env-x/documents')) {
    return jsonResponse({
      data: [
        {
          id: 'd-running',
          type: 'documents',
          attributes: { status: 'running' },
          links: { files: { original: 'https://exemplo/orig1.pdf' } },
        },
        {
          id: 'd-closed',
          type: 'documents',
          attributes: { status: 'closed' },
          links: { files: { original: 'https://exemplo/orig2.pdf' } },
        },
      ],
    });
  }
  if (url.endsWith('/documents/d-running') && init?.method === 'PATCH') {
    return jsonResponse({
      data: { id: 'd-running', type: 'documents', attributes: { status: 'canceled' } },
    });
  }
  return jsonResponse({ errors: [{ status: 500, detail: `unexpected ${url}` }] }, 500);
}

describe('ClicksignSignatureProvider', () => {
  it('createEnvelope: fluxo completo documentado (envelope → documento → signatários → requisitos → ativação)', async () => {
    const fetchImpl = vi.fn(
      (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        Promise.resolve(dispatchCreateEnvelope(urlOf(input), init)),
    );
    const provider = new ClicksignSignatureProvider({ token: 'tok-123', fetchImpl });

    const result = await provider.createEnvelope({
      contractId: 'c1',
      documentRef: PDF_BASE64,
      parties: [
        { partyId: 'p1', role: 'LANDLORD', signOrder: 1 },
        { partyId: 'p2', role: 'TENANT', signOrder: 2 },
      ],
    });

    expect(result).toEqual({ providerEnvelopeId: 'env-1' });
    const calls = recordCalls(fetchImpl);
    expect(calls).toHaveLength(7);

    // 1. Envelope (draft) com auto_close
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v3/envelopes' });
    const envelopeBody = calls[0]?.body as { data: { attributes: { auto_close: boolean } } };
    expect(envelopeBody.data.attributes).toMatchObject({ auto_close: true });

    // 2. Upload do documento base64
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/api/v3/envelopes/env-1/documents' });
    expect(documentAttributes(calls[1])).toEqual({
      filename: 'contrato-c1.pdf',
      contentBase64: PDF_BASE64,
    });

    // 3. Signatários na ordem de assinatura (group = signOrder)
    expect(signerAttributes(calls[2])).toEqual({ name: 'Proprietário 1', group: 1 });
    expect(signerAttributes(calls[4])).toEqual({ name: 'Locatário 2', group: 2 });

    // 4. Requisitos vinculam documento + signatário
    expect(relationshipIds(calls[3])).toEqual({ documentId: 'doc-1', signerId: 'sig-1' });
    expect(relationshipIds(calls[5])).toEqual({ documentId: 'doc-1', signerId: 'sig-2' });

    // 5. Ativação (status running)
    const activate = calls.find((call) => call.method === 'PATCH');
    expect(activate?.path).toBe('/api/v3/envelopes/env-1');
    expect(activate?.body).toMatchObject({
      data: { type: 'envelopes', attributes: { status: 'running' } },
    });

    // Auth: token cru no header (v3; esquema a confirmar na homologação)
    const firstInit = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(firstInit?.headers).toMatchObject({ authorization: 'tok-123' });
  });

  it('createEnvelope: aceita data URI com base64 e deriva filename do mime', async () => {
    const fetchImpl = vi.fn(
      (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        Promise.resolve(dispatchCreateEnvelope(urlOf(input), init)),
    );
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl });

    await provider.createEnvelope({
      contractId: 'c2',
      documentRef: `data:application/pdf;base64,${PDF_BASE64}`,
      parties: [{ partyId: 'p1', role: 'TENANT', signOrder: 1 }],
    });

    const calls = recordCalls(fetchImpl);
    expect(documentAttributes(calls[1])).toEqual({
      filename: 'contrato-c2.pdf',
      contentBase64: PDF_BASE64,
    });
  });

  it('createEnvelope: documentRef por URL/hash não é suportado (sem chamada HTTP)', async () => {
    const fetchImpl = vi.fn();
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl });
    const party = { partyId: 'p1', role: 'TENANT' as const, signOrder: 1 };

    await expect(
      provider.createEnvelope({
        contractId: 'c1',
        documentRef: 'https://exemplo.com/contrato.pdf',
        parties: [party],
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_DOCUMENT_REF' });
    await expect(
      provider.createEnvelope({
        contractId: 'c1',
        documentRef: 'a'.repeat(64),
        parties: [party],
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_DOCUMENT_REF' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['draft', 'PENDING'],
    ['running', 'SENT'],
    ['closed', 'SIGNED'],
    ['canceled', 'FAILED'],
  ] as const)('getStatus: %s → %s', async (providerStatus, expected) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { id: 'env-x', type: 'envelopes', attributes: { status: providerStatus } },
      }),
    );
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl });

    await expect(provider.getStatus('env-x')).resolves.toBe(expected);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('getStatus: status desconhecido → erro tipado UNKNOWN_STATUS', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { id: 'env-x', type: 'envelopes', attributes: { status: 'processing' } },
      }),
    );
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl });

    await expect(provider.getStatus('env-x')).rejects.toMatchObject({
      code: 'UNKNOWN_STATUS',
    });
  });

  it('getStatus: 401 com corpo JSON:API → erro tipado AUTH', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          errors: [
            {
              code: 'unauthorized',
              status: 401,
              title: 'Não autorizado',
              detail: 'Access Token inválido',
            },
          ],
        },
        401,
      ),
    );
    const provider = new ClicksignSignatureProvider({ token: 'token-invalido', fetchImpl });

    const error = await provider.getStatus('env-x').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(SignatureProviderError);
    expect(error).toMatchObject({ code: 'AUTH', status: 401 });
    expect((error as Error).message).toContain('Access Token inválido');
  });

  it('getStatus: 429 → erro tipado RATE_LIMIT', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { errors: [{ code: 'rate_limited', status: 429, detail: 'limit exceeded' }] },
          429,
        ),
      );
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl });

    await expect(provider.getStatus('env-x')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });

  it('getStatus: timeout (abort) → erro tipado TIMEOUT', async () => {
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl, timeoutMs: 20 });

    await expect(provider.getStatus('env-x')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('getStatus: resposta sem status → erro tipado INVALID_RESPONSE', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { id: 'env-x', type: 'envelopes', attributes: {} } }),
      );
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl });

    await expect(provider.getStatus('env-x')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('cancelEnvelope: cancela apenas documentos running (PATCH status=canceled)', async () => {
    const fetchImpl = vi.fn(
      (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        Promise.resolve(dispatchCancelEnvelope(urlOf(input), init)),
    );
    const provider = new ClicksignSignatureProvider({ token: 't', fetchImpl });

    await provider.cancelEnvelope('env-x');

    const calls = recordCalls(fetchImpl);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      path: '/api/v3/envelopes/env-x/documents/d-running',
    });
    expect(calls[1]?.body).toMatchObject({
      data: { type: 'documents', attributes: { status: 'canceled' } },
    });
  });

  it('getSignedDocumentUrl: retorna links.files.original do primeiro documento; null sem documentos', async () => {
    const withDocs = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'd1',
            type: 'documents',
            attributes: { status: 'closed' },
            links: {
              files: {
                original: 'https://clicksign-content-sandbox.s3.amazonaws.com/assinado.pdf',
              },
            },
          },
        ],
      }),
    );
    const providerWithDocs = new ClicksignSignatureProvider({ token: 't', fetchImpl: withDocs });
    await expect(providerWithDocs.getSignedDocumentUrl('env-x')).resolves.toBe(
      'https://clicksign-content-sandbox.s3.amazonaws.com/assinado.pdf',
    );

    const empty = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const providerEmpty = new ClicksignSignatureProvider({ token: 't', fetchImpl: empty });
    await expect(providerEmpty.getSignedDocumentUrl('env-x')).resolves.toBeNull();
  });
});
