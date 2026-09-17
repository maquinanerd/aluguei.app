import { Buffer } from 'node:buffer';
import { z } from 'zod';
import type {
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  EnvelopeParty,
  EnvelopeStatus,
  ISignatureProvider,
  SignatureProviderName,
} from './types.js';

export type SignatureProviderErrorCode =
  | 'UNSUPPORTED_DOCUMENT_REF'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_INPUT'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'HTTP'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN_STATUS';

/** Erro tipado do provider Clicksign (código estável para tratamento no domínio). */
export class SignatureProviderError extends Error {
  readonly code: SignatureProviderErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: SignatureProviderErrorCode,
    message: string,
    opts?: { status?: number; details?: unknown },
  ) {
    super(message);
    this.name = 'SignatureProviderError';
    this.code = code;
    if (opts?.status !== undefined) {
      this.status = opts.status;
    }
    if (opts?.details !== undefined) {
      this.details = opts.details;
    }
  }
}

export interface ClicksignSignatureProviderOptions {
  token: string;
  /** Host + base path. Padrão: sandbox (seguro p/ dev); produção: https://app.clicksign.com/api/v3. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// API v3 Clicksign (JSON:API) — estados do envelope → domínio.
const ENVELOPE_STATUS_MAP: Record<string, EnvelopeStatus> = {
  draft: 'PENDING',
  running: 'SENT',
  closed: 'SIGNED',
  canceled: 'FAILED',
};

const ROLE_LABELS: Record<EnvelopeParty['role'], string> = {
  LANDLORD: 'Proprietário',
  TENANT: 'Locatário',
  GUARANTOR: 'Fiador',
};

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/** Recurso JSON:API com id (envelope/documento/signatário/requisito). */
const resourceSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({ status: z.string().optional() }),
  }),
});

/** Detalhes do envelope (GET /envelopes/{id}) — status é obrigatório. */
const envelopeDetailSchema = z.object({
  data: z.object({
    attributes: z.object({ status: z.string() }),
  }),
});

/** Lista de documentos (GET /envelopes/{id}/documents). */
const documentsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({ status: z.string() }),
      links: z.object({
        files: z.object({ original: z.string() }).optional(),
      }),
    }),
  ),
});

const jsonApiErrorSchema = z.object({
  errors: z
    .array(
      z.object({
        code: z.string().optional(),
        title: z.string().optional(),
        detail: z.string().optional(),
      }),
    )
    .optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, context: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new SignatureProviderError(
      'INVALID_RESPONSE',
      `Clicksign: resposta inválida em ${context}`,
    );
  }
  return parsed.data;
}

/**
 * Adapter Clicksign — API v3 (JSON:API, REST + fetch nativo, sem SDK).
 *
 * Fluxo documentado (Guia de criação): criar envelope (draft) → upload do
 * documento (base64) → signatários (group = ordem de assinatura) → requisito
 * (qualificação) → ativação (status running). Ref.: docs/CLICKSIGN_HOMOLOGATION.md.
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real de homologação; o esquema
 * exato do header Authorization (token cru vs `Bearer`) e o link do documento
 * assinado precisam ser confirmados no sandbox.
 */
export class ClicksignSignatureProvider implements ISignatureProvider {
  readonly name: SignatureProviderName = 'CLICKSIGN';
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ClicksignSignatureProviderOptions) {
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl ?? 'https://sandbox.clicksign.com/api/v3').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult> {
    if (input.parties.length === 0) {
      throw new SignatureProviderError('INVALID_INPUT', 'Clicksign: envelope sem signatários');
    }
    const document = resolveDocument(input.documentRef, input.contractId);
    const envelope = await this.createEnvelopeDraft(input.contractId);
    const uploaded = await this.uploadDocument(
      envelope.id,
      document.filename,
      document.contentBase64,
    );
    const orderedParties = [...input.parties].sort((a, b) => a.signOrder - b.signOrder);
    for (const party of orderedParties) {
      const signer = await this.createSigner(envelope.id, party);
      await this.createRequirement(envelope.id, uploaded.id, signer.id);
    }
    await this.activateEnvelope(envelope.id);
    return { providerEnvelopeId: envelope.id };
  }

  async getStatus(providerEnvelopeId: string): Promise<EnvelopeStatus> {
    const parsed = parseOrThrow(
      envelopeDetailSchema,
      await this.request(`/envelopes/${encodeURIComponent(providerEnvelopeId)}`, 'GET'),
      `GET /envelopes/${providerEnvelopeId}`,
    );
    const mapped = ENVELOPE_STATUS_MAP[parsed.data.attributes.status];
    if (!mapped) {
      throw new SignatureProviderError(
        'UNKNOWN_STATUS',
        `Clicksign: status não mapeado "${parsed.data.attributes.status}"`,
        { details: { providerEnvelopeId } },
      );
    }
    return mapped;
  }

  /**
   * Extra (não faz parte de ISignatureProvider): cancela os documentos `running`
   * do envelope (PATCH status=canceled — único cancelamento documentado na v3;
   * DELETE só vale para rascunhos).
   */
  async cancelEnvelope(providerEnvelopeId: string): Promise<void> {
    const base = `/envelopes/${encodeURIComponent(providerEnvelopeId)}`;
    const parsed = parseOrThrow(
      documentsSchema,
      await this.request(`${base}/documents`, 'GET'),
      `GET ${base}/documents`,
    );
    for (const document of parsed.data) {
      if (document.attributes.status !== 'running') {
        continue;
      }
      await this.request(`${base}/documents/${encodeURIComponent(document.id)}`, 'PATCH', {
        data: {
          id: document.id,
          type: 'documents',
          attributes: { status: 'canceled' },
        },
      });
    }
  }

  /**
   * Extra: URL de download do primeiro documento. A v3 documenta apenas
   * `links.files.original` (sem URL separada do arquivo assinado) — confirmar
   * no sandbox se o link passa a servir o arquivo assinado após `closed`.
   */
  async getSignedDocumentUrl(providerEnvelopeId: string): Promise<string | null> {
    const base = `/envelopes/${encodeURIComponent(providerEnvelopeId)}`;
    const parsed = parseOrThrow(
      documentsSchema,
      await this.request(`${base}/documents`, 'GET'),
      `GET ${base}/documents`,
    );
    return parsed.data[0]?.links.files?.original ?? null;
  }

  private async createEnvelopeDraft(contractId: string): Promise<{ id: string }> {
    const parsed = parseOrThrow(
      resourceSchema,
      await this.request('/envelopes', 'POST', {
        data: {
          type: 'envelopes',
          attributes: {
            name: `Contrato ${contractId}`,
            auto_close: true,
          },
        },
      }),
      'POST /envelopes',
    );
    return { id: parsed.data.id };
  }

  private async uploadDocument(
    envelopeId: string,
    filename: string,
    contentBase64: string,
  ): Promise<{ id: string }> {
    const base = `/envelopes/${encodeURIComponent(envelopeId)}`;
    const parsed = parseOrThrow(
      resourceSchema,
      await this.request(`${base}/documents`, 'POST', {
        data: {
          type: 'documents',
          attributes: { filename, content_base64: contentBase64 },
        },
      }),
      `POST ${base}/documents`,
    );
    return { id: parsed.data.id };
  }

  private async createSigner(envelopeId: string, party: EnvelopeParty): Promise<{ id: string }> {
    const base = `/envelopes/${encodeURIComponent(envelopeId)}`;
    const parsed = parseOrThrow(
      resourceSchema,
      await this.request(`${base}/signers`, 'POST', {
        data: {
          type: 'signers',
          attributes: {
            // A interface não carrega nome/e-mail do signatário: usa rótulo
            // determinístico por papel+ordem e desativa notificação por e-mail
            // (o que torna o e-mail não obrigatório na v3). Identidade real é
            // item de homologação — ver docs/CLICKSIGN_HOMOLOGATION.md.
            name: `${ROLE_LABELS[party.role]} ${String(party.signOrder)}`,
            group: party.signOrder,
            communicate_events: { signature_request: 'none' },
          },
        },
      }),
      `POST ${base}/signers`,
    );
    return { id: parsed.data.id };
  }

  private async createRequirement(
    envelopeId: string,
    documentId: string,
    signerId: string,
  ): Promise<void> {
    const base = `/envelopes/${encodeURIComponent(envelopeId)}`;
    await this.request(`${base}/requirements`, 'POST', {
      data: {
        type: 'requirements',
        attributes: { action: 'agree', role: 'sign' },
        relationships: {
          document: { data: { type: 'documents', id: documentId } },
          signer: { data: { type: 'signers', id: signerId } },
        },
      },
    });
  }

  private async activateEnvelope(envelopeId: string): Promise<void> {
    await this.request(`/envelopes/${encodeURIComponent(envelopeId)}`, 'PATCH', {
      data: {
        id: envelopeId,
        type: 'envelopes',
        attributes: { status: 'running' },
      },
    });
  }

  private async request(
    path: string,
    method: 'GET' | 'POST' | 'PATCH',
    body?: unknown,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const init: RequestInit = {
        method,
        signal: controller.signal,
        headers: {
          // v3 (referência/curl oficial): token cru no header Authorization.
          // A página inicial mostra `Bearer <token>` — esquema a confirmar no sandbox.
          authorization: this.token,
          accept: 'application/vnd.api+json',
          'content-type': 'application/vnd.api+json',
        },
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
      if (!response.ok) {
        throw await this.errorFromResponse(response, `${method} ${path}`);
      }
      const text = await response.text();
      if (!text) {
        throw new SignatureProviderError(
          'INVALID_RESPONSE',
          `Clicksign: resposta vazia em ${method} ${path}`,
        );
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new SignatureProviderError(
          'INVALID_RESPONSE',
          `Clicksign: JSON inválido em ${method} ${path}`,
        );
      }
    } catch (err) {
      if (err instanceof SignatureProviderError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SignatureProviderError(
          'TIMEOUT',
          `Clicksign: timeout após ${String(this.timeoutMs)}ms em ${method} ${path}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async errorFromResponse(
    response: Response,
    context: string,
  ): Promise<SignatureProviderError> {
    let detail = `HTTP ${String(response.status)}`;
    let apiCode: string | undefined;
    let title: string | undefined;
    try {
      const body: unknown = await response.json();
      const firstError = jsonApiErrorSchema.safeParse(body).data?.errors?.[0];
      if (firstError) {
        apiCode = firstError.code;
        title = firstError.title;
        detail = firstError.detail ?? firstError.title ?? detail;
      }
    } catch {
      // corpo não-JSON — mantém o HTTP status como detail
    }
    const code =
      response.status === 401 || response.status === 403
        ? 'AUTH'
        : response.status === 429
          ? 'RATE_LIMIT'
          : 'HTTP';
    return new SignatureProviderError(code, `Clicksign: ${detail} (${context})`, {
      status: response.status,
      details: { apiCode, title },
    });
  }
}

/**
 * Resolve o documento do envelope. A API v3 documenta apenas upload por base64
 * (arquivo real) ou por modelo — referência por URL/hash não é suportada.
 */
function resolveDocument(
  documentRef: string,
  contractId: string,
): { filename: string; contentBase64: string } {
  const dataUri = /^data:([^;,]*);base64,(.+)$/s.exec(documentRef);
  if (dataUri) {
    // O regex garante os grupos: mime pode ser vazio; conteúdo é não-vazio.
    const [, mime = '', contentBase64 = ''] = dataUri;
    return {
      contentBase64,
      filename: `contrato-${contractId}.${MIME_EXTENSIONS[mime] ?? 'pdf'}`,
    };
  }
  if (/^data:/.test(documentRef)) {
    throw new SignatureProviderError(
      'UNSUPPORTED_DOCUMENT_REF',
      'Clicksign: data URI sem base64 não é suportado (a v3 aceita apenas upload base64)',
    );
  }
  if (isPdfBase64(documentRef)) {
    return { contentBase64: documentRef, filename: `contrato-${contractId}.pdf` };
  }
  throw new SignatureProviderError(
    'UNSUPPORTED_DOCUMENT_REF',
    'Clicksign v3 documenta apenas upload de arquivo por base64 (POST /envelopes/{id}/documents) — documentRef por URL/hash não é suportado pelo provider; envie o documento em base64 (ou data URI)',
  );
}

/** Base64 cru reconhecível: decodifica para um arquivo PDF (%PDF). */
function isPdfBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length < 16) {
    return false;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.length > 0 && decoded.subarray(0, 5).toString('latin1') === '%PDF-';
}
