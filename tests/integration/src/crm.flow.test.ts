import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, registerUser } from './helpers.js';

interface LeadBody {
  lead: { id: string; status: string };
}

interface ListLeadsBody {
  leads: Array<{ id: string }>;
}

describe('fluxo CRM: funil de leads', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createLead(): Promise<{ cookie: string; leadId: string }> {
    const { cookie } = await registerUser(app);
    const res = await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    return { cookie, leadId: (res.json() as LeadBody).lead.id };
  }

  it('percorre o funil até WON e timeline registra eventos', async () => {
    const { cookie, leadId } = await createLead();

    const order = ['QUALIFYING', 'QUALIFIED', 'VISIT', 'PROPOSAL', 'APPLICATION', 'WON'] as const;
    for (const status of order) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/leads/${leadId}/status`,
        headers: { cookie },
        payload: { status },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as LeadBody).lead.status).toBe(status);
    }

    const timeline = await app.inject({
      method: 'GET',
      url: `/timeline?entityType=LEAD&entityId=${leadId}`,
      headers: { cookie },
    });
    expect(timeline.statusCode).toBe(200);
    const events = (timeline.json() as { events: Array<{ eventType: string }> }).events.map(
      (e) => e.eventType,
    );
    expect(events).toContain('LEAD_CREATED');
    expect(events).toContain('LEAD_STATUS_CHANGED');
  });

  it('transição inválida após WON → 409', async () => {
    const { cookie, leadId } = await createLead();
    for (const status of [
      'QUALIFYING',
      'QUALIFIED',
      'VISIT',
      'PROPOSAL',
      'APPLICATION',
      'WON',
    ] as const) {
      await app.inject({
        method: 'PATCH',
        url: `/leads/${leadId}/status`,
        headers: { cookie },
        payload: { status },
      });
    }
    const invalid = await app.inject({
      method: 'PATCH',
      url: `/leads/${leadId}/status`,
      headers: { cookie },
      payload: { status: 'QUALIFYING' },
    });
    expect(invalid.statusCode).toBe(409);
  });

  it('LOST sem motivo → 409; com motivo → 200', async () => {
    const { cookie, leadId } = await createLead();

    const noReason = await app.inject({
      method: 'PATCH',
      url: `/leads/${leadId}/status`,
      headers: { cookie },
      payload: { status: 'LOST' },
    });
    expect(noReason.statusCode).toBe(409);

    const withReason = await app.inject({
      method: 'PATCH',
      url: `/leads/${leadId}/status`,
      headers: { cookie },
      payload: { status: 'LOST', reason: 'encontrou outro imóvel' },
    });
    expect(withReason.statusCode).toBe(200);
    expect((withReason.json() as LeadBody).lead.status).toBe('LOST');
  });

  it('lista com filtro por status', async () => {
    const { cookie } = await registerUser(app);
    await app.inject({ method: 'POST', url: '/leads', headers: { cookie }, payload: {} });
    await app.inject({ method: 'POST', url: '/leads', headers: { cookie }, payload: {} });

    const list = await app.inject({ method: 'GET', url: '/leads?status=NEW', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as ListLeadsBody).leads.length).toBe(2);
  });

  it('audit events são gravados (via timeline)', async () => {
    const { cookie } = await registerUser(app);
    const res = await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);

    const timeline = await app.inject({
      method: 'GET',
      url: `/timeline?entityType=LEAD&entityId=${(res.json() as LeadBody).lead.id}`,
      headers: { cookie },
    });
    expect((timeline.json() as { events: unknown[] }).events.length).toBeGreaterThan(0);
  });
});
