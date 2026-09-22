import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { conversations, rentalApplications } from '@aluguei/db';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { processReconcileJob, runInboxJobs } from '@aluguei/worker';
import { createFinanceFixtures } from './finance-fixtures.js';
import { buildTestApp, fakePayments, fakeSignature, registerUser } from './helpers.js';

/**
 * Vocabulário que a API e o worker gravam igual ao que o contrato descreve (pendências do
 * inventário da trilha G do G3, auditoria 2026-09-10, P2-12):
 *
 * 1. `timeline_events.entity_type`: a devolução da conversa grava `CONVERSATION`, a troca de
 *    status do anúncio grava `LISTING` e a decisão do screening grava `RENTAL_APPLICATION`, mas o
 *    contrato só listava LEAD, PARTY, PROPOSAL, VISIT e TASK — a timeline dessas entidades não
 *    podia ser lida (400). A criação manual (`POST /timeline`) continua restrita às entidades do
 *    CRM.
 * 2. O filtro `status` de `GET /reconciliations` aceitava `RUNNING`/`COMPLETED`/`FAILED`, que a
 *    coluna nunca guarda, e recusava `MATCHED`/`DISCREPANCY`, que são as opções do filtro da tela.
 * 3. `reconciliations.provider`: sem provider de pagamento configurado, a conciliação grava
 *    `NONE`; o contrato passa a descrever `FAKE | ASAAS | NONE`.
 */
type Json = Record<string, unknown>;

interface TimelineBody {
  events: Array<{ entityType: string; entityId: string; eventType: string }>;
}

interface ReconciliationsBody {
  reconciliations: Array<{ id: string; provider: string; status: string }>;
  total: number;
}

describe('vocabulário da timeline e da conciliação igual ao contrato', () => {
  let app: FastifyInstance;
  const screening = new FakeScreeningProvider();
  const worker = () =>
    runInboxJobs({
      db: app.db,
      limit: 20,
      screening,
      signature: fakeSignature,
      payments: fakePayments,
    });
  let fx: ReturnType<typeof createFinanceFixtures>;

  beforeAll(async () => {
    app = await buildTestApp();
    fx = createFinanceFixtures(app, () => worker());
  });

  afterAll(async () => {
    await app.close();
  });

  const timeline = async (cookie: string, entityType: string, entityId: string) =>
    app.inject({
      method: 'GET',
      url: `/timeline?entityType=${entityType}&entityId=${entityId}`,
      headers: { cookie },
    });

  it('timeline da conversa devolvida ao atendimento automático (CONVERSATION)', async () => {
    const { cookie, body } = await registerUser(app);
    const [conversation] = await app.db
      .insert(conversations)
      .values({ orgId: body.org.id, status: 'NEEDS_HUMAN' })
      .returning();
    const conversationId = conversation?.id ?? '';
    const resume = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/resume`,
      headers: { cookie },
      payload: {},
    });
    expect(resume.statusCode, resume.body).toBe(200);

    const res = await timeline(cookie, 'CONVERSATION', conversationId);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as TimelineBody).events).toEqual([
      expect.objectContaining({
        entityType: 'CONVERSATION',
        entityId: conversationId,
        eventType: 'HANDOFF_RETURNED',
      }) as Json,
    ]);
  });

  it('timeline do anúncio com a troca de status (LISTING)', async () => {
    const { cookie } = await registerUser(app);
    const call = async (method: 'POST' | 'PUT' | 'PATCH', url: string, payload: Json) => {
      const res = await app.inject({ method, url, headers: { cookie }, payload });
      expect(res.statusCode, `${method} ${url}: ${res.body}`).toBeLessThan(300);
      return res.json() as Json;
    };
    const property = (await call('POST', '/properties', {
      title: 'Imóvel da timeline',
      propertyType: 'APARTMENT',
      bedrooms: 2,
    })) as { property: { id: string } };
    const propertyId = property.property.id;
    await call('PUT', `/properties/${propertyId}/address`, {
      privateAddress: { street: 'Rua Privada', city: 'SP' },
      publicAddress: { neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
    });
    await call('PUT', `/properties/${propertyId}/financial-terms`, { monthlyRentCents: 300000 });
    const listing = (await call('POST', '/listings', {
      propertyId,
      title: 'Anúncio da timeline',
    })) as { listing: { id: string } };
    const listingId = listing.listing.id;
    await call('PATCH', `/listings/${listingId}/status`, { status: 'READY' });

    const res = await timeline(cookie, 'LISTING', listingId);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as TimelineBody).events).toEqual([
      expect.objectContaining({
        entityType: 'LISTING',
        entityId: listingId,
        eventType: 'LISTING_STATUS_CHANGED',
      }) as Json,
    ]);
  });

  it('timeline da candidatura com a decisão do screening (RENTAL_APPLICATION)', async () => {
    const lease = await fx.setupLease({ rentCents: 150_000, landlord: true });
    const [application] = await app.db
      .select({ id: rentalApplications.id })
      .from(rentalApplications)
      .where(eq(rentalApplications.orgId, lease.orgId));
    const applicationId = application?.id ?? '';

    const res = await timeline(lease.cookie, 'RENTAL_APPLICATION', applicationId);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as TimelineBody).events.map((event) => event.eventType)).toContain(
      'SCREENING_DECIDED',
    );
  });

  it('criação manual na timeline continua só para as entidades do CRM', async () => {
    const { cookie, body } = await registerUser(app);
    const [conversation] = await app.db
      .insert(conversations)
      .values({ orgId: body.org.id, status: 'OPEN' })
      .returning();
    const res = await app.inject({
      method: 'POST',
      url: '/timeline',
      headers: { cookie },
      payload: {
        entityType: 'CONVERSATION',
        entityId: conversation?.id ?? '',
        eventType: 'NOTE',
      },
    });
    expect(res.statusCode, res.body).toBe(400);
  });

  it('filtro de status da conciliação usa o vocabulário gravado; sem provider, NONE', async () => {
    const lease = await fx.setupLease({ rentCents: 120_000, landlord: true });
    // Cobrança paga sem pagamento no provider: o total local diverge do provider.
    await app.db.execute(sql`
      insert into charges (id, org_id, lease_id, period_start, due_date, status, amount_cents, rent_cents)
      values (${randomUUID()}, ${lease.orgId}, ${lease.leaseId}, '2020-01-01', '2020-01-10', 'PAID', 120000, 120000)
    `);
    // O mesmo período que `POST /reconciliations` enfileira.
    const job = () => ({
      id: randomUUID(),
      orgId: lease.orgId,
      payload: { periodStart: '2020-01-01', periodEnd: '2020-01-31' },
    });
    await processReconcileJob(app.db, job(), fakePayments);
    await processReconcileJob(app.db, job(), null);

    const list = async (query: string) =>
      app.inject({
        method: 'GET',
        url: `/reconciliations${query}`,
        headers: { cookie: lease.cookie },
      });

    const all = await list('');
    expect(all.statusCode, all.body).toBe(200);
    const rows = (all.json() as ReconciliationsBody).reconciliations;
    // A varredura diária do worker (setupLease) também concilia com o FAKE; a rodada sem
    // provider grava NONE.
    const providers = new Set(rows.map((row) => row.provider));
    expect(providers.has('FAKE') && providers.has('NONE'), [...providers].join(',')).toBe(true);
    expect(rows.some((row) => row.status === 'DISCREPANCY')).toBe(true);

    // As opções do filtro da tela são os status gravados: cada filtro devolve exatamente as
    // linhas com aquele status.
    for (const status of ['PENDING', 'MATCHED', 'DISCREPANCY']) {
      const res = await list(`?status=${status}`);
      expect(res.statusCode, `${status}: ${res.body}`).toBe(200);
      const filtered = res.json() as ReconciliationsBody;
      const expected = rows.filter((row) => row.status === status).map((row) => row.id);
      expect(filtered.reconciliations.map((row) => row.id).sort(), status).toEqual(expected.sort());
      expect(filtered.total, status).toBe(expected.length);
    }
    // Status que a coluna nunca guarda são recusados, não devolvem lista vazia.
    for (const status of ['RUNNING', 'COMPLETED', 'FAILED']) {
      const res = await list(`?status=${status}`);
      expect(res.statusCode, `${status}: ${res.body}`).toBe(400);
    }
  });
});
