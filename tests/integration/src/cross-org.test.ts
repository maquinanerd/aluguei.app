import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, registerUser } from './helpers.js';

interface LeadBody {
  lead: { id: string };
}

describe('gate: autorização cross-organization negativa', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('usuário da org A não acessa lead da org B (404, sem enumeração)', async () => {
    const a = await registerUser(app, { email: 'a-cross@example.com', organizationName: 'Org A' });
    const b = await registerUser(app, { email: 'b-cross@example.com', organizationName: 'Org B' });

    const leadRes = await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { cookie: b.cookie },
      payload: { notes: 'lead da org B' },
    });
    expect(leadRes.statusCode).toBe(201);
    const leadId = (leadRes.json() as LeadBody).lead.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/leads/${leadId}/status`,
      headers: { cookie: a.cookie },
      payload: { status: 'QUALIFYING' },
    });
    expect(patch.statusCode).toBe(404);

    const list = await app.inject({ method: 'GET', url: '/leads', headers: { cookie: a.cookie } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { leads: unknown[] }).leads).toHaveLength(0);
  });

  it('dedupe de party é escopado por org', async () => {
    const a = await registerUser(app, {
      email: 'a-party@example.com',
      organizationName: 'Org Dedupe A',
    });
    const b = await registerUser(app, {
      email: 'b-party@example.com',
      organizationName: 'Org Dedupe B',
    });

    await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie: b.cookie },
      payload: {
        type: 'PERSON',
        name: 'Party B',
        identities: [{ kind: 'CPF', value: '11122233344' }],
      },
    });

    const dedupe = await app.inject({
      method: 'POST',
      url: '/parties/dedupe',
      headers: { cookie: a.cookie },
      payload: { identities: [{ kind: 'CPF', value: '11122233344' }] },
    });
    expect(dedupe.statusCode).toBe(200);
    expect((dedupe.json() as { matches: unknown[] }).matches).toHaveLength(0);
  });

  it('members de outra org → 404 (sem enumeração de org)', async () => {
    const a = await registerUser(app, {
      email: 'a-members@example.com',
      organizationName: 'Org M A',
    });
    const b = await registerUser(app, {
      email: 'b-members@example.com',
      organizationName: 'Org M B',
    });

    const list = await app.inject({
      method: 'GET',
      url: `/organizations/${b.body.org.id}/members`,
      headers: { cookie: a.cookie },
    });
    expect(list.statusCode).toBe(404);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/organizations/${b.body.org.id}/members/00000000-0000-0000-0000-000000000000`,
      headers: { cookie: a.cookie },
      payload: { role: 'agent' },
    });
    expect(patch.statusCode).toBe(404);
  });
});
