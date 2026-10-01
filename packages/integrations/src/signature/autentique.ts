import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { SignatureProviderError } from './errors.js';
import type { SignatureProviderErrorCode } from './errors.js';
import type {
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  EnvelopeSigner,
  EnvelopeStatus,
  ISignatureProvider,
  SignatureProviderName,
} from './types.js';

export interface AutentiqueSignatureProviderOptions {
  token: string;
  /** `true`: documento de teste (`sandbox: true`), sem custo e sem validade jurídica. */
  sandbox: boolean;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Espera antes da segunda tentativa de uma consulta (padrão 1 s). */
  retryDelayMs?: number;
}

const ENDPOINT = 'https://api.autentique.com.br/v2/graphql';
/** Limite de arquivo do plano profissional (o gratuito aceita 5 MB). */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TRANSIENT: ReadonlySet<SignatureProviderErrorCode> = new Set(['RATE_LIMIT', 'TIMEOUT']);

const graphqlErrorSchema = z
  .object({
    message: z.string().optional(),
    extensions: z
      .object({ validation: z.record(z.string(), z.unknown()).optional() })
      .loose()
      .optional(),
  })
  .loose();

const graphqlResponseSchema = z
  .object({ data: z.unknown().optional(), errors: z.array(graphqlErrorSchema).optional() })
  .loose();

const createdDocumentSchema = z.object({
  createDocument: z
    .object({
      id: z.string().min(1),
      signatures: z.array(
        z.object({ public_id: z.string().min(1), email: z.string().nullish() }).loose(),
      ),
    })
    .loose(),
});

const eventoSchema = z.object({ created_at: z.string().nullish() }).loose().nullish();

const documentStatusSchema = z.object({
  document: z
    .object({
      id: z.string().min(1),
      signatures: z.array(
        z
          .object({ public_id: z.string().min(1), signed: eventoSchema, rejected: eventoSchema })
          .loose(),
      ),
    })
    .loose()
    .nullable(),
});

function createDocumentMutation(sandbox: boolean): string {
  return [
    'mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {',
    `  createDocument(sandbox: ${sandbox ? 'true' : 'false'}, document: $document, signers: $signers, file: $file) {`,
    '    id',
    '    signatures { public_id email }',
    '  }',
    '}',
  ].join('\n');
}

/** Estado do envelope a partir das assinaturas do documento (consulta `document`). */
export function statusFromSignatures(
  signatures: ReadonlyArray<{ signed?: unknown; rejected?: unknown }>,
): EnvelopeStatus {
  if (signatures.some((signature) => Boolean(signature.rejected))) {
    return 'FAILED';
  }
  const signed = signatures.filter((signature) => Boolean(signature.signed)).length;
  if (signatures.length > 0 && signed === signatures.length) {
    return 'SIGNED';
  }
  return signed > 0 ? 'PARTIALLY_SIGNED' : 'SENT';
}

/**
 * Adapter da Autentique — API GraphQL v2 (`POST /v2/graphql`, `Authorization: Bearer`), com
 * `fetch` nativo e sem SDK. Decisão do dono em 01/10/2026: Autentique no lugar da Clicksign.
 *
 * O documento sobe por multipart (graphql-multipart-request-spec) com cada parte como signatário
 * por e-mail: a Autentique manda o pedido de assinatura e cobra por documento e por pedido. Do
 * cadastro da pessoa só sai o e-mail — o nome e o CPF ela informa ao assinar. Com `sandbox`, o
 * documento é de teste: não consome crédito, não tem validade e some depois de alguns dias.
 *
 * Sem nova tentativa na criação: a API não tem chave de idempotência, e repetir depois de um tempo
 * esgotado pode criar (e cobrar) um segundo documento. A consulta de estado tenta duas vezes.
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem token real, nada foi enviado à Autentique
 * (docs/integrations/AUTENTIQUE_HOMOLOGATION.md).
 */
export class AutentiqueSignatureProvider implements ISignatureProvider {
  readonly name: SignatureProviderName = 'AUTENTIQUE';
  readonly requiresSignerEmail = true;
  readonly testOnly: boolean;
  private readonly token: string;
  private readonly sandbox: boolean;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(opts: AutentiqueSignatureProviderOptions) {
    this.token = opts.token;
    this.sandbox = opts.sandbox;
    this.testOnly = opts.sandbox;
    this.endpoint = opts.endpoint ?? ENDPOINT;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.retryDelayMs = opts.retryDelayMs ?? 1_000;
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult> {
    if (input.parties.length === 0) {
      throw new SignatureProviderError('INVALID_INPUT', 'Autentique: documento sem signatários');
    }
    const ordered = [...input.parties].sort((a, b) => a.signOrder - b.signOrder);
    const emails = ordered.map((party) => {
      const email = party.email?.trim().toLowerCase();
      if (!email) {
        throw new SignatureProviderError(
          'SIGNER_EMAIL_REQUIRED',
          `Autentique: a parte de ordem ${String(party.signOrder)} não tem e-mail`,
          { details: { signOrder: party.signOrder } },
        );
      }
      return email;
    });
    if (new Set(emails).size !== emails.length) {
      throw new SignatureProviderError(
        'INVALID_INPUT',
        'Autentique: duas partes com o mesmo e-mail — cada assinatura precisa de um e-mail próprio',
      );
    }
    const pdf = pdfFromDocumentRef(input.documentRef);

    const form = new FormData();
    form.append(
      'operations',
      JSON.stringify({
        query: createDocumentMutation(this.sandbox),
        variables: {
          document: { name: input.title },
          signers: emails.map((email) => ({ email, action: 'SIGN' })),
          file: null,
        },
      }),
    );
    form.append('map', JSON.stringify({ file: ['variables.file'] }));
    form.append(
      'file',
      new Blob([pdf], { type: 'application/pdf' }),
      `contrato-${input.contractId}.pdf`,
    );

    const data = await this.request(form, 'createDocument', false);
    const created = parseOrThrow(createdDocumentSchema, data, 'createDocument').createDocument;
    return {
      providerEnvelopeId: created.id,
      signers: mapSigners(ordered, emails, created.signatures),
    };
  }

  async getStatus(providerEnvelopeId: string): Promise<EnvelopeStatus> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(providerEnvelopeId)) {
      throw new SignatureProviderError('INVALID_INPUT', 'Autentique: id de documento inválido');
    }
    const query = `query { document(id: ${JSON.stringify(providerEnvelopeId)}) { id signatures { public_id signed { created_at } rejected { created_at } } } }`;
    const data = await this.request(JSON.stringify({ query }), 'document', true);
    const document = parseOrThrow(documentStatusSchema, data, 'document').document;
    if (!document) {
      throw new SignatureProviderError(
        'PROVIDER_REJECTED',
        'Autentique: documento não encontrado',
        {
          details: { code: 'document_not_found' },
        },
      );
    }
    return statusFromSignatures(document.signatures);
  }

  /** Uma tentativa, ou duas para consulta (limite, tempo esgotado ou 5xx). */
  private async request(
    body: FormData | string,
    context: string,
    retryable: boolean,
  ): Promise<unknown> {
    try {
      return await this.once(body, context);
    } catch (err) {
      const transient =
        err instanceof SignatureProviderError &&
        (TRANSIENT.has(err.code) || (err.code === 'HTTP' && (err.status ?? 500) >= 500));
      if (!retryable || !transient) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      return this.once(body, context);
    }
  }

  private async once(body: FormData | string, context: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.token}`,
        accept: 'application/json',
      };
      if (typeof body === 'string') {
        headers['content-type'] = 'application/json';
      }
      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new SignatureProviderError(
            'TIMEOUT',
            `Autentique: tempo esgotado após ${String(this.timeoutMs)} ms em ${context}`,
          );
        }
        throw new SignatureProviderError('HTTP', `Autentique: falha de rede em ${context}`);
      }
      const parsed = await readJson(response);
      if (!response.ok) {
        const code =
          response.status === 401 || response.status === 403
            ? 'AUTH'
            : response.status === 429
              ? 'RATE_LIMIT'
              : 'HTTP';
        throw new SignatureProviderError(
          code,
          `Autentique: HTTP ${String(response.status)} em ${context}`,
          { status: response.status },
        );
      }
      const envelope = graphqlResponseSchema.safeParse(parsed);
      if (!envelope.success) {
        throw new SignatureProviderError(
          'INVALID_RESPONSE',
          `Autentique: resposta inválida em ${context}`,
        );
      }
      const [firstError] = envelope.data.errors ?? [];
      if (firstError) {
        throw errorFromGraphql(firstError, context);
      }
      return envelope.data.data;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Erro do GraphQL sem dado pessoal: a mensagem só passa quando é um código ("validation",
 * "document_not_found") ou uma frase curta sem aspas — mensagens de variável inválida repetem o
 * valor enviado, que pode ser um e-mail. Da validação, só os nomes dos campos.
 */
function errorFromGraphql(
  error: z.infer<typeof graphqlErrorSchema>,
  context: string,
): SignatureProviderError {
  const message = error.message ?? '';
  if (message === 'unauthorized' || /not authenticated/i.test(message)) {
    return new SignatureProviderError('AUTH', `Autentique: token recusado em ${context}`);
  }
  const safe = message.length <= 80 && !/["'@]/.test(message) ? message : 'erro do GraphQL';
  const fields = Object.keys(error.extensions?.validation ?? {});
  const suffix = fields.length > 0 ? ` (${fields.join(', ')})` : '';
  return new SignatureProviderError(
    'PROVIDER_REJECTED',
    `Autentique: ${safe}${suffix} em ${context}`,
    { details: { message: safe, fields } },
  );
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, context: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new SignatureProviderError(
      'INVALID_RESPONSE',
      `Autentique: resposta inválida em ${context}`,
    );
  }
  return parsed.data;
}

/** O documento sai do PDF gerado do contrato (P1-11); outro formato é recusado antes da chamada. */
function pdfFromDocumentRef(documentRef: string): Uint8Array<ArrayBuffer> {
  const match = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(documentRef);
  const base64 = match?.[1];
  if (!base64) {
    throw new SignatureProviderError(
      'UNSUPPORTED_DOCUMENT_REF',
      'Autentique: o documento precisa ser um PDF em data URI base64',
    );
  }
  const decoded = Buffer.from(base64, 'base64');
  if (decoded.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new SignatureProviderError(
      'UNSUPPORTED_DOCUMENT_REF',
      'Autentique: o conteúdo não é um PDF',
    );
  }
  if (decoded.length > MAX_FILE_BYTES) {
    throw new SignatureProviderError('INVALID_INPUT', 'Autentique: PDF acima de 20 MB');
  }
  const bytes = new Uint8Array(decoded.length);
  bytes.set(decoded);
  return bytes;
}

/**
 * Liga cada parte à assinatura criada: pelo e-mail e, se a resposta não trouxer e-mail mas tiver
 * uma assinatura por parte, pela ordem de envio. A parte sem par fica de fora — o documento já
 * existe e os pedidos já saíram, então o envelope é gravado mesmo assim.
 */
function mapSigners(
  ordered: ReadonlyArray<{ signOrder: number }>,
  emails: readonly string[],
  signatures: ReadonlyArray<{ public_id: string; email?: string | null | undefined }>,
): EnvelopeSigner[] {
  const byEmail = new Map<string, string>();
  for (const signature of signatures) {
    if (signature.email) {
      byEmail.set(signature.email.trim().toLowerCase(), signature.public_id);
    }
  }
  const samePosition = signatures.length === ordered.length;
  const used = new Set<string>();
  const signers: EnvelopeSigner[] = [];
  ordered.forEach((party, index) => {
    const email = emails[index];
    const id =
      (email === undefined ? undefined : byEmail.get(email)) ??
      (samePosition ? signatures[index]?.public_id : undefined);
    if (id && !used.has(id)) {
      used.add(id);
      signers.push({ signOrder: party.signOrder, providerSignerId: id });
    }
  });
  return signers;
}
