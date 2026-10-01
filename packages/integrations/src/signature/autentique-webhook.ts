import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Cabeçalho com o HMAC-SHA256 (hex) do corpo cru, calculado com o segredo do endpoint. */
export const AUTENTIQUE_SIGNATURE_HEADER = 'x-autentique-signature';

/** Evento da Autentique no formato interno do webhook de assinatura. */
export interface AutentiqueSignatureEvent {
  eventType: 'SIGNER_SIGNED' | 'COMPLETED' | 'FAILED';
  /**
   * Chave de idempotência: tipo + id do objeto, como a Autentique recomenda — ela pode entregar o
   * mesmo evento mais de uma vez, com ids de evento diferentes.
   */
  providerEventId: string;
  /** Id do documento na Autentique (o `providerEnvelopeId` do envelope). */
  providerEnvelopeId: string;
  /** `public_id` da assinatura, para achar a parte (só em SIGNER_SIGNED). */
  providerSignerId?: string;
}

export class AutentiqueWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutentiqueWebhookError';
  }
}

/** Confere o `x-autentique-signature` em tempo constante; cabeçalho ausente ou fora do formato é recusa. */
export function verifyAutentiqueSignature(
  rawBody: Uint8Array,
  presented: string | string[] | undefined,
  secret: string,
): boolean {
  const header = (Array.isArray(presented) ? presented[0] : presented)?.trim();
  if (header === undefined || !/^[0-9a-f]{64}$/i.test(header)) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(header, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const webhookSchema = z
  .object({
    event: z.object({ id: z.string().min(1), type: z.string().min(1), data: z.unknown() }).loose(),
  })
  .loose();

const documentRefSchema = z.union([
  z.string().min(1),
  z
    .object({ id: z.string().min(1) })
    .loose()
    .transform((document) => document.id),
]);

const signatureSchema = z
  .object({ public_id: z.string().min(1), document: documentRefSchema })
  .loose();

const documentSchema = z
  .object({
    id: z.string().min(1),
    signatures: z
      .array(z.object({ public_id: z.string().min(1), signed: z.unknown().optional() }).loose())
      .optional(),
  })
  .loose();

/**
 * A documentação mostra os dois formatos: o objeto em `data.object` (exemplo de `document.updated`)
 * e o objeto direto em `data` (exemplos de documento e de assinatura, em que `object` é o nome do
 * tipo). Aceita os dois.
 */
function objectOf(data: unknown): unknown {
  if (typeof data === 'object' && data !== null && 'object' in data) {
    const inner = (data as { object: unknown }).object;
    if (typeof inner === 'object' && inner !== null) {
      return inner;
    }
  }
  return data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, type: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AutentiqueWebhookError(`evento ${type} sem os campos esperados`);
  }
  return parsed.data;
}

/**
 * Traduz o webhook da Autentique. Só quatro eventos mudam o envelope; os outros (criação, edição,
 * visualização, biometria, falha de entrega) voltam sem evento e o endpoint responde 200.
 *
 * `document.finished` repete um SIGNER_SIGNED por assinatura feita, com a mesma chave do
 * `signature.accepted`: se algum aceite se perdeu, o documento concluído ainda fecha o contrato, e
 * se não se perdeu, a chave igual descarta a repetição.
 */
export function parseAutentiqueWebhook(body: unknown): {
  type: string;
  events: AutentiqueSignatureEvent[];
} {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    throw new AutentiqueWebhookError('payload sem event.id e event.type');
  }
  const { type, data } = parsed.data.event;
  const object = objectOf(data);
  switch (type) {
    case 'signature.accepted': {
      const signature = parse(signatureSchema, object, type);
      return {
        type,
        events: [
          {
            eventType: 'SIGNER_SIGNED',
            providerEventId: `signature.accepted:${signature.public_id}`,
            providerEnvelopeId: signature.document,
            providerSignerId: signature.public_id,
          },
        ],
      };
    }
    case 'signature.rejected': {
      const signature = parse(signatureSchema, object, type);
      return {
        type,
        events: [
          {
            eventType: 'FAILED',
            providerEventId: `signature.rejected:${signature.public_id}`,
            providerEnvelopeId: signature.document,
          },
        ],
      };
    }
    case 'document.finished': {
      const document = parse(documentSchema, object, type);
      const signed = (document.signatures ?? []).filter(
        (signature) =>
          signature.signed !== null && signature.signed !== undefined && signature.signed !== false,
      );
      return {
        type,
        events: [
          ...signed.map((signature): AutentiqueSignatureEvent => ({
            eventType: 'SIGNER_SIGNED',
            providerEventId: `signature.accepted:${signature.public_id}`,
            providerEnvelopeId: document.id,
            providerSignerId: signature.public_id,
          })),
          {
            eventType: 'COMPLETED',
            providerEventId: `document.finished:${document.id}`,
            providerEnvelopeId: document.id,
          },
        ],
      };
    }
    case 'document.deleted': {
      const document = parse(documentSchema, object, type);
      return {
        type,
        events: [
          {
            eventType: 'FAILED',
            providerEventId: `document.deleted:${document.id}`,
            providerEnvelopeId: document.id,
          },
        ],
      };
    }
    default:
      return { type, events: [] };
  }
}
