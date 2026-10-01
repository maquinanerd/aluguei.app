import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AutentiqueWebhookError,
  parseAutentiqueWebhook,
  verifyAutentiqueSignature,
} from './autentique-webhook.js';

const SECRET = 'segredo-do-endpoint';

function assinar(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function webhook(type: string, data: unknown): Record<string, unknown> {
  return {
    id: 'd2ViaG9vaw==',
    object: 'webhook',
    name: 'aluguei',
    format: 'json',
    url: 'https://api.example.test/webhooks/signature/autentique',
    event: { id: `evt-${type}`, object: 'event', organization: 1, type, data },
  };
}

describe('verifyAutentiqueSignature', () => {
  const body = JSON.stringify(webhook('document.updated', { id: 'doc-1' }));
  const raw = Buffer.from(body);

  it('aceita o HMAC-SHA256 hex do corpo cru', () => {
    expect(verifyAutentiqueSignature(raw, assinar(body), SECRET)).toBe(true);
    expect(verifyAutentiqueSignature(raw, assinar(body).toUpperCase(), SECRET)).toBe(true);
    expect(verifyAutentiqueSignature(raw, [assinar(body)], SECRET)).toBe(true);
  });

  it('recusa segredo errado, corpo alterado, cabeçalho ausente ou fora do formato', () => {
    expect(verifyAutentiqueSignature(raw, assinar(body, 'outro'), SECRET)).toBe(false);
    expect(verifyAutentiqueSignature(Buffer.from(`${body} `), assinar(body), SECRET)).toBe(false);
    expect(verifyAutentiqueSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyAutentiqueSignature(raw, 'sha256=abc', SECRET)).toBe(false);
    expect(verifyAutentiqueSignature(raw, assinar(body).slice(2), SECRET)).toBe(false);
  });
});

describe('parseAutentiqueWebhook', () => {
  it('signature.accepted (objeto direto em data) vira SIGNER_SIGNED com o public_id', () => {
    const parsed = parseAutentiqueWebhook(
      webhook('signature.accepted', {
        public_id: 'sig-1',
        object: 'signature',
        document: 'doc-1',
        signed: '2025-01-31T12:22:30.000000Z',
      }),
    );
    expect(parsed).toEqual({
      type: 'signature.accepted',
      events: [
        {
          eventType: 'SIGNER_SIGNED',
          providerEventId: 'signature.accepted:sig-1',
          providerEnvelopeId: 'doc-1',
          providerSignerId: 'sig-1',
        },
      ],
    });
  });

  it('aceita também o objeto em data.object e o documento como objeto', () => {
    const parsed = parseAutentiqueWebhook(
      webhook('signature.accepted', {
        object: { public_id: 'sig-2', document: { id: 'doc-2' } },
        previous_attributes: [],
      }),
    );
    expect(parsed.events).toEqual([
      {
        eventType: 'SIGNER_SIGNED',
        providerEventId: 'signature.accepted:sig-2',
        providerEnvelopeId: 'doc-2',
        providerSignerId: 'sig-2',
      },
    ]);
  });

  it('signature.rejected vira FAILED', () => {
    const parsed = parseAutentiqueWebhook(
      webhook('signature.rejected', { public_id: 'sig-3', document: 'doc-3' }),
    );
    expect(parsed.events).toEqual([
      {
        eventType: 'FAILED',
        providerEventId: 'signature.rejected:sig-3',
        providerEnvelopeId: 'doc-3',
      },
    ]);
  });

  it('document.finished repete as assinaturas feitas, com a chave do aceite, e conclui', () => {
    const parsed = parseAutentiqueWebhook(
      webhook('document.finished', {
        id: 'doc-4',
        object: 'document',
        signatures: [
          { public_id: 'a', signed: '2025-01-31T12:22:30.000000Z' },
          { public_id: 'b', signed: null },
          { public_id: 'c', signed: '2025-01-31T12:30:00.000000Z' },
        ],
      }),
    );
    expect(parsed.events).toEqual([
      {
        eventType: 'SIGNER_SIGNED',
        providerEventId: 'signature.accepted:a',
        providerEnvelopeId: 'doc-4',
        providerSignerId: 'a',
      },
      {
        eventType: 'SIGNER_SIGNED',
        providerEventId: 'signature.accepted:c',
        providerEnvelopeId: 'doc-4',
        providerSignerId: 'c',
      },
      {
        eventType: 'COMPLETED',
        providerEventId: 'document.finished:doc-4',
        providerEnvelopeId: 'doc-4',
      },
    ]);
  });

  it('document.deleted vira FAILED', () => {
    expect(parseAutentiqueWebhook(webhook('document.deleted', { id: 'doc-5' })).events).toEqual([
      {
        eventType: 'FAILED',
        providerEventId: 'document.deleted:doc-5',
        providerEnvelopeId: 'doc-5',
      },
    ]);
  });

  it('eventos que não mudam o envelope voltam vazios', () => {
    for (const type of [
      'document.created',
      'document.updated',
      'signature.viewed',
      'member.created',
    ]) {
      expect(parseAutentiqueWebhook(webhook(type, { id: 'doc-6' })).events).toEqual([]);
    }
  });

  it('payload sem evento ou sem os campos do objeto é erro', () => {
    expect(() => parseAutentiqueWebhook({ foo: 1 })).toThrow(AutentiqueWebhookError);
    expect(() => parseAutentiqueWebhook(webhook('signature.accepted', { public_id: 'x' }))).toThrow(
      AutentiqueWebhookError,
    );
  });
});
