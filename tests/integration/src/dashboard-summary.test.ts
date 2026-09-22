import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  charges,
  contracts,
  conversations,
  inspections,
  leads,
  leases,
  listingChannelPublications,
  listings,
  parties,
  payouts,
  properties,
  proposals,
  rentalApplications,
  tasks,
  visits,
} from '@aluguei/db';
import { buildTestApp, registerUser } from './helpers.js';
import type { RegisteredUser } from './helpers.js';

/**
 * P1-01 (auditoria 2026-09-10): a Visão Geral buscava 12 listas com
 * `limit=200` — 400 silencioso, tudo zero e "Nenhuma pendência operacional"
 * com dados existentes. GET /dashboard/summary agrega no banco, por
 * organização e por permissão. Cada número é comparado com uma contagem SQL
 * independente sobre o mesmo banco, com mais de 100 leads para provar que o
 * resultado não é o tamanho de uma página.
 */

const DAY_MS = 86_400_000;
/** America/Sao_Paulo é UTC-3 fixo desde 2019 (sem horário de verão): oráculo independente do Intl. */
const SAO_PAULO_OFFSET_MS = -3 * 3_600_000;

interface TaskItem {
  id: string;
  title: string;
  dueAt: string;
  relatedEntityType: string | null;
}
interface VisitItem {
  id: string;
  scheduledAt: string;
  status: string;
  propertyId: string | null;
}
interface ChargeItem {
  id: string;
  amountCents: number;
  status: string;
  dueDate: string;
}

interface DashboardSummary {
  generatedAt: string;
  today: { start: string; end: string; timeZone: string };
  crm: {
    openLeads: number;
    newLeadsToday: number;
    leadsWithoutOwner: number;
    awaitingResponse: number;
    qualified: number;
  } | null;
  tasks: {
    overdue: number;
    dueToday: number;
    overdueItems: TaskItem[];
    dueTodayItems: TaskItem[];
  } | null;
  visits: { active: number; upcomingItems: VisitItem[] } | null;
  proposals: { nonDraft: number } | null;
  properties: { available: number; archived: number } | null;
  listings: {
    publishedPublications: number;
    failedPublications: number;
    failedByChannel: Array<{ channel: string; failed: number }>;
  } | null;
  screening: { total: number; pending: number } | null;
  contracts: { nonVoid: number; pending: number; awaitingSignature: number } | null;
  inspections: { open: number } | null;
  finance: {
    activeLeases: number;
    nonEndedLeases: number;
    scheduledCharges: number;
    openCharges: number;
    overdueCharges: number;
    overdueAmountCents: number;
    pendingPayouts: number;
    overdueItems: ChargeItem[];
  } | null;
  conversations: { open: number; needsHuman: number } | null;
}

interface Day {
  start: Date;
  end: Date;
}

function saoPauloDay(now: Date): Day {
  const wall = new Date(now.getTime() + SAO_PAULO_OFFSET_MS);
  const start =
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - SAO_PAULO_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

function monthStart(now: number, deltaMonths: number): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deltaMonths, 1))
    .toISOString()
    .slice(0, 10);
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`seed: ${what}`);
  }
  return value;
}

/** Mesma composição para toda organização; só a quantidade de leads novos muda. */
async function seedOrganization(
  app: FastifyInstance,
  user: RegisteredUser,
  newOwnerlessLeads: number,
  day: Day,
): Promise<void> {
  const db = app.db;
  const orgId = user.body.org.id;
  const userId = user.body.user.id;
  const now = Date.now();
  const at = (ms: number) => new Date(ms);
  const laterToday = at(now + Math.floor((day.end.getTime() - now) / 2));

  const propertyRows = await db
    .insert(properties)
    .values([
      { orgId, title: 'Imóvel ativo 1', propertyType: 'APARTMENT', status: 'ACTIVE' },
      { orgId, title: 'Imóvel ativo 2', propertyType: 'HOUSE', status: 'ACTIVE' },
      { orgId, title: 'Imóvel arquivado', propertyType: 'HOUSE', status: 'ARCHIVED' },
    ])
    .returning();
  const p1 = must(propertyRows[0], 'imóvel 1');
  const p2 = must(propertyRows[1], 'imóvel 2');
  const party = must(
    (await db.insert(parties).values({ orgId, type: 'PERSON', name: 'Pessoa' }).returning())[0],
    'pessoa',
  );

  const listingRows = await db
    .insert(listings)
    .values([
      { orgId, propertyId: p1.id, title: 'Anúncio 1', slug: 'anuncio-1', status: 'PUBLISHED' },
      { orgId, propertyId: p2.id, title: 'Anúncio 2', slug: 'anuncio-2', status: 'DRAFT' },
    ])
    .returning();
  const l1 = must(listingRows[0], 'anúncio 1');
  const l2 = must(listingRows[1], 'anúncio 2');
  await db.insert(listingChannelPublications).values([
    { orgId, listingId: l1.id, channel: 'fake', status: 'PUBLISHED' },
    { orgId, listingId: l1.id, channel: 'zap', status: 'FAILED' },
    { orgId, listingId: l2.id, channel: 'fake', status: 'FAILED' },
    { orgId, listingId: l2.id, channel: 'olx', status: 'PENDING' },
  ]);

  await db.insert(leads).values([
    ...Array.from({ length: newOwnerlessLeads }, () => ({
      orgId,
      status: 'NEW',
      ownerUserId: null,
      createdAt: at(now - 3 * DAY_MS),
    })),
    { orgId, status: 'QUALIFYING', ownerUserId: userId, createdAt: at(now) },
    { orgId, status: 'QUALIFYING', ownerUserId: userId, createdAt: at(now) },
    { orgId, status: 'QUALIFIED', ownerUserId: userId, createdAt: at(now - 2 * DAY_MS) },
    { orgId, status: 'QUALIFIED', ownerUserId: userId, createdAt: at(now - 2 * DAY_MS) },
    { orgId, status: 'QUALIFIED', ownerUserId: userId, createdAt: at(now - 2 * DAY_MS) },
    { orgId, status: 'WON', ownerUserId: null, createdAt: at(now) },
    { orgId, status: 'LOST', ownerUserId: userId, createdAt: at(now - 10 * DAY_MS) },
  ]);

  await db.insert(tasks).values([
    { orgId, title: 'Atrasada há dois dias', status: 'OPEN', dueAt: at(now - 2 * DAY_MS) },
    { orgId, title: 'Atrasada há meia hora', status: 'OPEN', dueAt: at(now - 30 * 60_000) },
    { orgId, title: 'Vence ainda hoje', status: 'OPEN', dueAt: laterToday },
    { orgId, title: 'Vence amanhã', status: 'OPEN', dueAt: at(day.end.getTime() + DAY_MS) },
    { orgId, title: 'Sem prazo', status: 'OPEN', dueAt: null },
    { orgId, title: 'Concluída atrasada', status: 'DONE', dueAt: at(now - DAY_MS) },
  ]);

  await db.insert(visits).values([
    {
      orgId,
      propertyId: p1.id,
      status: 'SCHEDULED',
      scheduledAt: at(day.end.getTime() + DAY_MS),
    },
    { orgId, propertyId: p1.id, status: 'CONFIRMED', scheduledAt: laterToday },
    { orgId, status: 'SCHEDULED', scheduledAt: at(now - 3 * DAY_MS) },
    // Desde a migration 0020 (trilha D do G3, P2-02), visita cancelada tem motivo.
    {
      orgId,
      status: 'CANCELLED',
      cancelReason: 'interessado desistiu',
      scheduledAt: at(day.end.getTime() + 2 * DAY_MS),
    },
    { orgId, status: 'NO_SHOW', scheduledAt: at(now - DAY_MS) },
    { orgId, status: 'DONE', scheduledAt: at(now - 2 * DAY_MS) },
  ]);

  // Desde a migration 0020 (trilha D do G3, P2-02), proposta enviada tem validade e recusada tem
  // motivo. As contagens do dashboard não dependem disso.
  await db.insert(proposals).values(
    ['DRAFT', 'SENT', 'SENT', 'REJECTED'].map((status) => ({
      orgId,
      status,
      monthlyRentCents: 100_000,
      validUntil: status === 'DRAFT' ? null : '2099-12-31',
      decisionReason: status === 'REJECTED' ? 'fora do orçamento' : null,
    })),
  );

  // Desde a migration 0015 (trilha A do G2, P1-06), APPROVED exige a trilha da
  // decisão — motivo, data e origem. As contagens do dashboard não dependem disso.
  await db.insert(rentalApplications).values(
    ['DRAFT', 'SUBMITTED', 'SCREENING', 'MANUAL_REVIEW', 'APPROVED'].map((status) => ({
      orgId,
      partyId: party.id,
      propertyId: p1.id,
      status,
      ...(status === 'APPROVED'
        ? {
            decisionReason: 'Renda comprovada (semente do teste)',
            decisionSource: 'MANUAL',
            decidedBy: userId,
            decidedAt: at(now - DAY_MS),
          }
        : {}),
    })),
  );

  const contractRows = await db
    .insert(contracts)
    .values(
      [
        'DRAFT',
        'GENERATED',
        'SENT_FOR_SIGNATURE',
        'PARTIALLY_SIGNED',
        'SIGNED',
        'SIGNED',
        'SIGNED',
        'VOID',
      ].map((status) => ({ orgId, status })),
    )
    .returning();
  const signed = contractRows.filter((c) => c.status === 'SIGNED');

  await db.insert(inspections).values(
    ['DRAFT', 'CAPTURING', 'REVIEW', 'COMPLETED', 'SIGNED'].map((status) => ({
      orgId,
      propertyId: p1.id,
      type: 'CHECKIN',
      status,
    })),
  );

  const startDate = monthStart(now, -6);
  const leaseRows = await db
    .insert(leases)
    .values([
      {
        orgId,
        contractId: must(signed[0], 'contrato 1').id,
        propertyId: p1.id,
        status: 'ACTIVE',
        startDate,
        monthlyRentCents: 250_000,
      },
      {
        orgId,
        contractId: must(signed[1], 'contrato 2').id,
        propertyId: p2.id,
        status: 'DELINQUENT',
        startDate,
        monthlyRentCents: 250_000,
      },
      {
        orgId,
        contractId: must(signed[2], 'contrato 3').id,
        propertyId: p2.id,
        status: 'ENDED',
        startDate,
        monthlyRentCents: 250_000,
      },
    ])
    .returning();
  const lease = must(leaseRows[0], 'locação ativa');

  const charge = (deltaMonths: number, status: string, amountCents: number) => ({
    orgId,
    leaseId: lease.id,
    periodStart: monthStart(now, deltaMonths),
    dueDate: monthStart(now, deltaMonths),
    status,
    amountCents,
    rentCents: amountCents,
  });
  await db
    .insert(charges)
    .values([
      charge(1, 'SCHEDULED', 250_000),
      charge(0, 'OPEN', 250_000),
      charge(-2, 'OVERDUE', 150_000),
      charge(-1, 'OVERDUE', 90_000),
      charge(-3, 'PAID', 250_000),
      charge(-4, 'CANCELLED', 250_000),
    ]);

  await db.insert(payouts).values([
    { orgId, partyId: party.id, amountCents: 1_000, status: 'PENDING' },
    { orgId, partyId: party.id, amountCents: 2_000, status: 'PENDING' },
    { orgId, partyId: party.id, amountCents: 3_000, status: 'PAID' },
    { orgId, partyId: party.id, amountCents: 4_000, status: 'FAILED' },
  ]);

  await db.insert(conversations).values(
    ['OPEN', 'ACTIVE', 'NEEDS_HUMAN', 'NEEDS_HUMAN', 'CLOSED'].map((status) => ({
      orgId,
      status,
    })),
  );
}

async function rows(app: FastifyInstance, query: SQL): Promise<Array<Record<string, unknown>>> {
  const result = (await app.db.execute(query)) as unknown as {
    rows: Array<Record<string, unknown>>;
  };
  return result.rows;
}

async function scalar(app: FastifyInstance, query: SQL): Promise<number> {
  const [row] = await rows(app, query);
  return Number(row?.n);
}

async function ids(app: FastifyInstance, query: SQL): Promise<string[]> {
  return (await rows(app, query)).map((row) => String(row.id));
}

/**
 * Contagens SQL escritas à mão, independentes da rota — é o que o banco diz.
 * `now` é o `generatedAt` da própria resposta: o oráculo compara no mesmo
 * instante que a rota usou, sem corrida de relógio entre as duas consultas.
 */
async function oracle(app: FastifyInstance, orgId: string, now: Date) {
  const day = saoPauloDay(now);
  const start = day.start.toISOString();
  const end = day.end.toISOString();
  const nowIso = now.toISOString();
  const n = (query: SQL) => scalar(app, query);
  return {
    crm: {
      openLeads: await n(
        sql`select count(*) as n from leads where org_id = ${orgId} and status not in ('WON', 'LOST')`,
      ),
      newLeadsToday: await n(
        sql`select count(*) as n from leads where org_id = ${orgId} and created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz`,
      ),
      leadsWithoutOwner: await n(
        sql`select count(*) as n from leads where org_id = ${orgId} and status not in ('WON', 'LOST') and owner_user_id is null`,
      ),
      awaitingResponse: await n(
        sql`select count(*) as n from leads where org_id = ${orgId} and status in ('NEW', 'QUALIFYING')`,
      ),
      qualified: await n(
        sql`select count(*) as n from leads where org_id = ${orgId} and status = 'QUALIFIED'`,
      ),
    },
    tasks: {
      overdue: await n(
        sql`select count(*) as n from tasks where org_id = ${orgId} and status = 'OPEN' and due_at < ${nowIso}::timestamptz`,
      ),
      dueToday: await n(
        sql`select count(*) as n from tasks where org_id = ${orgId} and status = 'OPEN' and due_at >= ${nowIso}::timestamptz and due_at < ${end}::timestamptz`,
      ),
      overdueItems: await ids(
        app,
        sql`select id from tasks where org_id = ${orgId} and status = 'OPEN' and due_at < ${nowIso}::timestamptz order by due_at asc, id asc limit 8`,
      ),
      dueTodayItems: await ids(
        app,
        sql`select id from tasks where org_id = ${orgId} and status = 'OPEN' and due_at >= ${nowIso}::timestamptz and due_at < ${end}::timestamptz order by due_at asc, id asc limit 8`,
      ),
    },
    visits: {
      active: await n(
        sql`select count(*) as n from visits where org_id = ${orgId} and status not in ('CANCELLED', 'NO_SHOW')`,
      ),
      upcomingItems: await ids(
        app,
        sql`select id from visits where org_id = ${orgId} and status in ('SCHEDULED', 'CONFIRMED') and scheduled_at >= ${start}::timestamptz order by scheduled_at asc, id asc limit 6`,
      ),
    },
    proposals: {
      nonDraft: await n(
        sql`select count(*) as n from proposals where org_id = ${orgId} and status <> 'DRAFT'`,
      ),
    },
    properties: {
      available: await n(
        sql`select count(*) as n from properties where org_id = ${orgId} and status = 'ACTIVE'`,
      ),
      archived: await n(
        sql`select count(*) as n from properties where org_id = ${orgId} and status = 'ARCHIVED'`,
      ),
    },
    listings: {
      publishedPublications: await n(
        sql`select count(*) as n from listing_channel_publications where org_id = ${orgId} and status = 'PUBLISHED'`,
      ),
      failedPublications: await n(
        sql`select count(*) as n from listing_channel_publications where org_id = ${orgId} and status = 'FAILED'`,
      ),
      failedByChannel: (
        await rows(
          app,
          sql`select channel, count(*) as failed from listing_channel_publications where org_id = ${orgId} and status = 'FAILED' group by channel order by channel`,
        )
      ).map((row) => ({ channel: String(row.channel), failed: Number(row.failed) })),
    },
    screening: {
      total: await n(sql`select count(*) as n from rental_applications where org_id = ${orgId}`),
      pending: await n(
        sql`select count(*) as n from rental_applications where org_id = ${orgId} and status in ('SUBMITTED', 'SCREENING', 'MANUAL_REVIEW')`,
      ),
    },
    contracts: {
      nonVoid: await n(
        sql`select count(*) as n from contracts where org_id = ${orgId} and status <> 'VOID'`,
      ),
      pending: await n(
        sql`select count(*) as n from contracts where org_id = ${orgId} and status in ('DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED')`,
      ),
      awaitingSignature: await n(
        sql`select count(*) as n from contracts where org_id = ${orgId} and status in ('SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED')`,
      ),
    },
    inspections: {
      open: await n(
        sql`select count(*) as n from inspections where org_id = ${orgId} and status in ('DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW')`,
      ),
    },
    finance: {
      activeLeases: await n(
        sql`select count(*) as n from leases where org_id = ${orgId} and status in ('ACTIVE', 'DELINQUENT')`,
      ),
      nonEndedLeases: await n(
        sql`select count(*) as n from leases where org_id = ${orgId} and status <> 'ENDED'`,
      ),
      scheduledCharges: await n(
        sql`select count(*) as n from charges where org_id = ${orgId} and status = 'SCHEDULED'`,
      ),
      openCharges: await n(
        sql`select count(*) as n from charges where org_id = ${orgId} and status = 'OPEN'`,
      ),
      overdueCharges: await n(
        sql`select count(*) as n from charges where org_id = ${orgId} and status = 'OVERDUE'`,
      ),
      overdueAmountCents: await n(
        sql`select coalesce(sum(amount_cents), 0) as n from charges where org_id = ${orgId} and status = 'OVERDUE'`,
      ),
      pendingPayouts: await n(
        sql`select count(*) as n from payouts where org_id = ${orgId} and status = 'PENDING'`,
      ),
      overdueItems: await ids(
        app,
        sql`select id from charges where org_id = ${orgId} and status = 'OVERDUE' order by due_date asc, id asc limit 8`,
      ),
    },
    conversations: {
      open: await n(
        sql`select count(*) as n from conversations where org_id = ${orgId} and status in ('OPEN', 'ACTIVE', 'NEEDS_HUMAN')`,
      ),
      needsHuman: await n(
        sql`select count(*) as n from conversations where org_id = ${orgId} and status = 'NEEDS_HUMAN'`,
      ),
    },
  };
}

/** Projeção da resposta no formato do oráculo (itens comparados por id, na ordem). */
function project(summary: DashboardSummary) {
  const itemIds = (items: Array<{ id: string }> | undefined) => (items ?? []).map((i) => i.id);
  return {
    crm: summary.crm,
    tasks: summary.tasks && {
      overdue: summary.tasks.overdue,
      dueToday: summary.tasks.dueToday,
      overdueItems: itemIds(summary.tasks.overdueItems),
      dueTodayItems: itemIds(summary.tasks.dueTodayItems),
    },
    visits: summary.visits && {
      active: summary.visits.active,
      upcomingItems: itemIds(summary.visits.upcomingItems),
    },
    proposals: summary.proposals,
    properties: summary.properties,
    listings: summary.listings,
    screening: summary.screening,
    contracts: summary.contracts,
    inspections: summary.inspections,
    finance: summary.finance && {
      ...summary.finance,
      overdueItems: itemIds(summary.finance.overdueItems),
    },
    conversations: summary.conversations,
  };
}

describe('P1-01: GET /dashboard/summary — números iguais ao banco', () => {
  let app: FastifyInstance;
  let A: RegisteredUser;
  let B: RegisteredUser;
  let day: Day;

  async function summaryOf(cookie: string): Promise<{ status: number; body: DashboardSummary }> {
    const res = await app.inject({ method: 'GET', url: '/dashboard/summary', headers: { cookie } });
    return { status: res.statusCode, body: res.json() as DashboardSummary };
  }

  function assertSeededDay(now: Date): void {
    if (saoPauloDay(now).start.getTime() !== day.start.getTime()) {
      throw new Error(
        'o dia virou (America/Sao_Paulo) entre semear e consultar — execute novamente',
      );
    }
  }

  beforeAll(async () => {
    // Perto da meia-noite de São Paulo "hoje" mudaria entre semear e consultar:
    // espera a virada em vez de afrouxar qualquer comparação.
    const untilMidnight = saoPauloDay(new Date()).end.getTime() - Date.now();
    if (untilMidnight < 90_000) {
      await new Promise((resolve) => setTimeout(resolve, untilMidnight + 1_000));
    }
    day = saoPauloDay(new Date());
    app = await buildTestApp();
    A = await registerUser(app);
    B = await registerUser(app);
    await seedOrganization(app, A, 101, day);
    await seedOrganization(app, B, 7, day);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exige sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/summary' });
    expect(res.statusCode).toBe(401);
  });

  it('cada número bate com a contagem SQL independente da organização', async () => {
    const res = await summaryOf(A.cookie);
    expect(res.status).toBe(200);
    const now = new Date(res.body.generatedAt);
    assertSeededDay(now);
    const expected = await oracle(app, A.body.org.id, now);

    // O oráculo não é degenerado: mais de 100 leads abertos e todos os grupos com dado.
    expect(expected.crm).toEqual({
      openLeads: 106,
      newLeadsToday: 3,
      leadsWithoutOwner: 101,
      awaitingResponse: 103,
      qualified: 3,
    });
    expect(expected.tasks.overdue).toBe(2);
    expect(expected.tasks.dueToday).toBe(1);
    expect(expected.finance.overdueAmountCents).toBe(240_000);

    expect(project(res.body)).toEqual(expected);
    expect(res.body.today).toEqual({
      start: day.start.toISOString(),
      end: day.end.toISOString(),
      timeZone: 'America/Sao_Paulo',
    });
  });

  it('dados de outra organização não entram nos números', async () => {
    const a = await summaryOf(A.cookie);
    const b = await summaryOf(B.cookie);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const aNow = new Date(a.body.generatedAt);
    const bNow = new Date(b.body.generatedAt);
    assertSeededDay(aNow);
    assertSeededDay(bNow);
    expect(project(a.body)).toEqual(await oracle(app, A.body.org.id, aNow));
    expect(project(b.body)).toEqual(await oracle(app, B.body.org.id, bNow));
    expect(b.body.crm?.openLeads).toBe(12);

    // Sem o filtro de organização o total seria outro: a igualdade acima só vale com o filtro.
    const allOrgsOpenLeads = await scalar(
      app,
      sql`select count(*) as n from leads where org_id in (${A.body.org.id}, ${B.body.org.id}) and status not in ('WON', 'LOST')`,
    );
    expect(allOrgsOpenLeads).toBe(118);
    expect(a.body.crm?.openLeads).toBe(106);
  });

  it('RBAC: seção sem permissão vem null, as demais seguem iguais às do dono', async () => {
    const viewer = await registerUser(app);
    const added = await app.inject({
      method: 'POST',
      url: `/organizations/${A.body.org.id}/members`,
      headers: { cookie: A.cookie },
      payload: { userId: viewer.body.user.id, role: 'viewer' },
    });
    expect(added.statusCode).toBeLessThan(300);
    const switched = await app.inject({
      method: 'POST',
      url: '/auth/switch-org',
      headers: { cookie: viewer.cookie },
      payload: { orgId: A.body.org.id },
    });
    expect(switched.statusCode).toBe(200);

    const owner = await summaryOf(A.cookie);
    const res = await summaryOf(viewer.cookie);
    expect(res.status).toBe(200);
    expect(res.body.finance).toBeNull();
    expect(res.body.screening).toBeNull();
    expect(res.body.contracts).toBeNull();
    expect(res.body.inspections).toBeNull();
    expect(res.body.crm).toEqual(owner.body.crm);
    expect(res.body.properties).toEqual(owner.body.properties);
    expect(res.body.conversations).toEqual(owner.body.conversations);
  });
});
