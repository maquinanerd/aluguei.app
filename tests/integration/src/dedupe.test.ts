import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, registerUser } from './helpers.js';

interface PartyBody {
  party: { id: string };
  duplicate: boolean;
  matchedPartyId: string | null;
}

interface DedupeBody {
  matches: Array<{ partyId: string; name: string; reasons: string[] }>;
}

describe('CRM: parties e deduplicação', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria party e detecta duplicado por CPF (normalizado)', async () => {
    const { cookie } = await registerUser(app);
    const payload = {
      type: 'PERSON',
      name: 'João Silva',
      identities: [{ kind: 'CPF', value: '123.456.789-01' }],
    };

    const first = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect((first.json() as PartyBody).duplicate).toBe(false);

    const second = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: { ...payload, name: 'João da Silva' },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as PartyBody;
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.matchedPartyId).toBe((first.json() as PartyBody).party.id);
  });

  it('dedupe encontra candidatos com razões', async () => {
    const { cookie } = await registerUser(app);
    await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Maria Souza',
        identities: [
          { kind: 'CPF', value: '98765432100' },
          { kind: 'EMAIL', value: 'maria@example.com' },
        ],
      },
    });

    const dedupe = await app.inject({
      method: 'POST',
      url: '/parties/dedupe',
      headers: { cookie },
      payload: { identities: [{ kind: 'EMAIL', value: 'MARIA@example.com' }] },
    });
    expect(dedupe.statusCode).toBe(200);
    const matches = (dedupe.json() as DedupeBody).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toContain('EMAIL');
  });

  it('lista parties escopada por org', async () => {
    const { cookie } = await registerUser(app);
    await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'COMPANY',
        name: 'Construtora X',
        identities: [{ kind: 'CNPJ', value: '11222333000181' }],
      },
    });

    const list = await app.inject({ method: 'GET', url: '/parties', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const parties = (list.json() as { parties: Array<{ identities: Array<{ kind: string }> }> })
      .parties;
    expect(parties.length).toBe(1);
    expect(parties[0]?.identities[0]?.kind).toBe('CNPJ');
  });
});
