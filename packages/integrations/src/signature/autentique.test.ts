import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { AutentiqueSignatureProvider, statusFromSignatures } from './autentique.js';
import { SignatureProviderError } from './errors.js';
import type { CreateEnvelopeInput } from './types.js';

const ENDPOINT = 'https://api.autentique.com.br/v2/graphql';
const PDF = Buffer.from('%PDF-1.7\ndocumento de teste');
const DOCUMENT_REF = `data:application/pdf;base64,${PDF.toString('base64')}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function input(overrides: Partial<CreateEnvelopeInput> = {}): CreateEnvelopeInput {
  return {
    contractId: 'c-1',
    title: 'Contrato de locação · versão 1',
    documentRef: DOCUMENT_REF,
    parties: [
      {
        partyId: 'p-2',
        role: 'TENANT',
        signOrder: 2,
        name: 'Locatária',
        email: 'Locataria@Example.test',
      },
      {
        partyId: 'p-1',
        role: 'LANDLORD',
        signOrder: 1,
        name: 'Proprietária',
        email: 'dona@example.test',
      },
    ],
    ...overrides,
  };
}

function created(signatures: Array<{ public_id: string; email?: string | null }>): Response {
  return jsonResponse({ data: { createDocument: { id: 'doc-1', signatures } } });
}

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: FormData | string | undefined;
}

function sentCalls(fetchImpl: ReturnType<typeof vi.fn>): Sent[] {
  return fetchImpl.mock.calls.map((call) => {
    const [url, init] = call as [string, RequestInit];
    return {
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as FormData | string | undefined,
    };
  });
}

function operationsOf(sent: Sent | undefined): {
  query: string;
  variables: {
    document: { name: string };
    signers: Array<Record<string, unknown>>;
    file: null;
  };
} {
  const form = sent?.body as FormData;
  return JSON.parse(form.get('operations') as string) as ReturnType<typeof operationsOf>;
}

describe('AutentiqueSignatureProvider.createEnvelope', () => {
  it('sobe o PDF por multipart, com cada parte por e-mail na ordem de assinatura', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      created([
        { public_id: 'sig-dona', email: 'dona@example.test' },
        { public_id: 'sig-locataria', email: 'locataria@example.test' },
      ]),
    );
    const provider = new AutentiqueSignatureProvider({ token: 'tok-1', sandbox: true, fetchImpl });

    const result = await provider.createEnvelope(input());

    expect(result).toEqual({
      providerEnvelopeId: 'doc-1',
      signers: [
        { signOrder: 1, providerSignerId: 'sig-dona' },
        { signOrder: 2, providerSignerId: 'sig-locataria' },
      ],
    });
    const [sent] = sentCalls(fetchImpl);
    expect(sent?.url).toBe(ENDPOINT);
    expect(sent?.headers['authorization']).toBe('Bearer tok-1');
    const operations = operationsOf(sent);
    expect(operations.query).toContain('createDocument(sandbox: true,');
    expect(operations.variables).toEqual({
      document: { name: 'Contrato de locação · versão 1' },
      signers: [
        { email: 'dona@example.test', action: 'SIGN' },
        { email: 'locataria@example.test', action: 'SIGN' },
      ],
      file: null,
    });
    // Do cadastro só sai o e-mail: nada de nome, CPF ou id interno.
    expect(JSON.stringify(operations)).not.toMatch(/Proprietária|Locatária|p-1|p-2/);
    const form = sent?.body as FormData;
    expect(JSON.parse(form.get('map') as string)).toEqual({ file: ['variables.file'] });
    const file = form.get('file') as File;
    expect(file.name).toBe('contrato-c-1.pdf');
    expect(file.type).toBe('application/pdf');
    expect(Buffer.from(await file.arrayBuffer()).equals(PDF)).toBe(true);
  });

  it('fora do sandbox, o documento é criado de verdade', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      created([
        { public_id: 's1', email: 'dona@example.test' },
        { public_id: 's2', email: 'locataria@example.test' },
      ]),
    );
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: false, fetchImpl });
    expect(provider.testOnly).toBe(false);

    await provider.createEnvelope(input());

    expect(operationsOf(sentCalls(fetchImpl)[0]).query).toContain('createDocument(sandbox: false,');
  });

  it('sem e-mail na resposta, liga as partes pela ordem de envio', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(created([{ public_id: 'a' }, { public_id: 'b', email: null }]));
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });

    const result = await provider.createEnvelope(input());

    expect(result.signers).toEqual([
      { signOrder: 1, providerSignerId: 'a' },
      { signOrder: 2, providerSignerId: 'b' },
    ]);
  });

  it('parte sem e-mail é recusada antes de chamar a Autentique', async () => {
    const fetchImpl = vi.fn();
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });
    const semEmail = input();
    semEmail.parties = semEmail.parties.map((party) =>
      party.signOrder === 2 ? { ...party, email: null } : party,
    );

    const error = await provider.createEnvelope(semEmail).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SignatureProviderError);
    expect(error).toMatchObject({ code: 'SIGNER_EMAIL_REQUIRED', details: { signOrder: 2 } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('duas partes com o mesmo e-mail são recusadas antes de chamar a Autentique', async () => {
    const fetchImpl = vi.fn();
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });
    const repetido = input();
    repetido.parties = repetido.parties.map((party) => ({ ...party, email: 'mesmo@example.test' }));

    await expect(provider.createEnvelope(repetido)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('documento que não é PDF em data URI é recusado', async () => {
    const fetchImpl = vi.fn();
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });

    await expect(
      provider.createEnvelope(input({ documentRef: 'sha256:abc' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_DOCUMENT_REF' });
    await expect(
      provider.createEnvelope(
        input({
          documentRef: `data:application/pdf;base64,${Buffer.from('texto').toString('base64')}`,
        }),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_DOCUMENT_REF' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('token recusado vira AUTH (HTTP 401 ou erro "unauthorized" do GraphQL)', async () => {
    const http = vi.fn().mockResolvedValue(jsonResponse({ message: 'Unauthenticated' }, 401));
    await expect(
      new AutentiqueSignatureProvider({
        token: 't',
        sandbox: true,
        fetchImpl: http,
      }).createEnvelope(input()),
    ).rejects.toMatchObject({ code: 'AUTH', status: 401 });

    const graphql = vi
      .fn()
      .mockResolvedValue(jsonResponse({ errors: [{ message: 'unauthorized' }], data: null }));
    await expect(
      new AutentiqueSignatureProvider({
        token: 't',
        sandbox: true,
        fetchImpl: graphql,
      }).createEnvelope(input()),
    ).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('erro de validação leva só os nomes dos campos, nunca o valor enviado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        errors: [
          {
            message: 'validation',
            extensions: { validation: { 'signers.0.email': ['invalid_email'] } },
          },
        ],
        data: { createDocument: null },
      }),
    );
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });

    const error = (await provider.createEnvelope(input()).catch((err: unknown) => err)) as Error;

    expect(error).toMatchObject({
      code: 'PROVIDER_REJECTED',
      details: { message: 'validation', fields: ['signers.0.email'] },
    });
    expect(error.message).not.toContain('@');
  });

  it('mensagem do GraphQL que repete valor de variável não chega ao erro', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        errors: [{ message: 'Variable "$signers" got invalid value "dona@example.test"' }],
      }),
    );
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });

    const error = (await provider.createEnvelope(input()).catch((err: unknown) => err)) as Error;

    expect(error).toMatchObject({ code: 'PROVIDER_REJECTED' });
    expect(error.message).not.toContain('@');
    expect(error.message).toContain('erro do GraphQL');
  });

  it('criação não tenta de novo: 429 e 5xx param na primeira resposta', async () => {
    for (const status of [429, 503]) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, status));
      const provider = new AutentiqueSignatureProvider({
        token: 't',
        sandbox: true,
        fetchImpl,
        retryDelayMs: 0,
      });
      await expect(provider.createEnvelope(input())).rejects.toBeInstanceOf(SignatureProviderError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('tempo esgotado vira TIMEOUT', async () => {
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const provider = new AutentiqueSignatureProvider({
      token: 't',
      sandbox: true,
      fetchImpl,
      timeoutMs: 20,
    });

    await expect(provider.createEnvelope(input())).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('resposta sem o documento criado vira INVALID_RESPONSE', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { createDocument: null } }));
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });

    await expect(provider.createEnvelope(input())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('AutentiqueSignatureProvider.getStatus', () => {
  function documentResponse(
    signatures: Array<{ signed?: object | null; rejected?: object | null }>,
  ): Response {
    return jsonResponse({
      data: {
        document: {
          id: 'doc-1',
          signatures: signatures.map((signature, index) => ({
            public_id: `s${String(index)}`,
            signed: null,
            rejected: null,
            ...signature,
          })),
        },
      },
    });
  }

  it('consulta o documento por JSON e traduz as assinaturas', async () => {
    const assinado = { created_at: '2026-10-01T12:00:00.000000Z' };
    const casos: Array<[Array<{ signed?: object | null; rejected?: object | null }>, string]> = [
      [[{}, {}], 'SENT'],
      [[{ signed: assinado }, {}], 'PARTIALLY_SIGNED'],
      [[{ signed: assinado }, { signed: assinado }], 'SIGNED'],
      [[{ signed: assinado }, { rejected: assinado }], 'FAILED'],
    ];
    for (const [signatures, esperado] of casos) {
      const fetchImpl = vi.fn().mockResolvedValue(documentResponse(signatures));
      const provider = new AutentiqueSignatureProvider({ token: 'tok', sandbox: true, fetchImpl });
      expect(await provider.getStatus('doc-1')).toBe(esperado);
      const [sent] = sentCalls(fetchImpl);
      expect(sent?.headers['content-type']).toBe('application/json');
      expect(JSON.parse(sent?.body as string)).toMatchObject({
        query: expect.stringContaining('document(id: "doc-1")') as unknown,
      });
    }
  });

  it('id fora do formato é recusado sem chamada (nada entra na consulta)', async () => {
    const fetchImpl = vi.fn();
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });

    await expect(provider.getStatus('doc") { x }')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('consulta tenta de novo uma vez em 5xx e em limite', async () => {
    for (const status of [502, 429]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, status))
        .mockResolvedValueOnce(documentResponse([{}]));
      const provider = new AutentiqueSignatureProvider({
        token: 't',
        sandbox: true,
        fetchImpl,
        retryDelayMs: 0,
      });
      expect(await provider.getStatus('doc-1')).toBe('SENT');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });

  it('consulta não repete erro definitivo (token recusado)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    const provider = new AutentiqueSignatureProvider({
      token: 't',
      sandbox: true,
      fetchImpl,
      retryDelayMs: 0,
    });

    await expect(provider.getStatus('doc-1')).rejects.toMatchObject({ code: 'AUTH' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('documento inexistente vira PROVIDER_REJECTED', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ errors: [{ message: 'document_not_found' }], data: { document: null } }),
      );
    const provider = new AutentiqueSignatureProvider({ token: 't', sandbox: true, fetchImpl });

    await expect(provider.getStatus('doc-x')).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      details: { message: 'document_not_found' },
    });
  });
});

describe('statusFromSignatures', () => {
  it('sem assinatura nenhuma, o envelope segue enviado', () => {
    expect(statusFromSignatures([])).toBe('SENT');
  });
});
