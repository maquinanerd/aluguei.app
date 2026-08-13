import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, registerUser } from './helpers.js';

interface LeadBody {
  lead: { id: string };
}

describe('gate: RBAC por organização', () => {
  let app: FastifyInstance;
  let viewerSeq = 0;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupViewer(): Promise<{ viewerCookie: string; orgId: string; leadId: string }> {
    viewerSeq += 1;
    const suffix = `v${String(viewerSeq)}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await registerUser(app, {
      email: `owner-${suffix}@example.com`,
      organizationName: `Org RBAC ${suffix}`,
    });
    const viewer = await registerUser(app, {
      email: `viewer-${suffix}@example.com`,
      organizationName: `Org Pessoal ${suffix}`,
    });

    const add = await app.inject({
      method: 'POST',
      url: `/organizations/${owner.body.org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: viewer.body.user.id, role: 'viewer' },
    });
    expect(add.statusCode).toBe(201);

    const lead = await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(lead.statusCode).toBe(201);

    const sw = await app.inject({
      method: 'POST',
      url: '/auth/switch-org',
      headers: { cookie: viewer.cookie },
      payload: { orgId: owner.body.org.id },
    });
    expect(sw.statusCode).toBe(200);

    return {
      viewerCookie: viewer.cookie,
      orgId: owner.body.org.id,
      leadId: (lead.json() as LeadBody).lead.id,
    };
  }

  it('viewer lê lead mas não muda status (403)', async () => {
    const { viewerCookie, leadId } = await setupViewer();

    const list = await app.inject({
      method: 'GET',
      url: '/leads',
      headers: { cookie: viewerCookie },
    });
    expect(list.statusCode).toBe(200);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/leads/${leadId}/status`,
      headers: { cookie: viewerCookie },
      payload: { status: 'QUALIFYING' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('viewer não gerencia membros (403)', async () => {
    const { viewerCookie, orgId } = await setupViewer();

    const create = await app.inject({
      method: 'POST',
      url: `/organizations/${orgId}/members`,
      headers: { cookie: viewerCookie },
      payload: { userId: '00000000-0000-0000-0000-000000000000', role: 'agent' },
    });
    expect(create.statusCode).toBe(403);
  });

  it('owner gerencia membros e remove', async () => {
    const owner = await registerUser(app, {
      email: 'owner-mgmt@example.com',
      organizationName: 'Org Mgmt',
    });
    const member = await registerUser(app, {
      email: 'member-mgmt@example.com',
      organizationName: 'Org M2',
    });

    const add = await app.inject({
      method: 'POST',
      url: `/organizations/${owner.body.org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: member.body.user.id, role: 'agent' },
    });
    expect(add.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/organizations/${owner.body.org.id}/members`,
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { members: unknown[] }).members.length).toBeGreaterThanOrEqual(2);

    const remove = await app.inject({
      method: 'DELETE',
      url: `/organizations/${owner.body.org.id}/members/${member.body.user.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(remove.statusCode).toBe(200);
  });
});
