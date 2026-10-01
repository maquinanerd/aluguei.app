import { randomUUID } from 'node:crypto';
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

type QueueItem =
  | {
      kind: 'LEAD';
      tone: 'danger';
      id: string;
      name: string | null;
      source: string | null;
      channel: string | null;
      at: string;
    }
  | {
      kind: 'VISIT';
      tone: 'neutral';
      id: string;
      name: string | null;
      property: string | null;
      status: string;
      at: string;
    }
  | {
      kind: 'PROPOSAL';
      tone: 'warning';
      id: string;
      name: string | null;
      property: string | null;
      validUntil: string;
    }
  | {
      kind: 'INSPECTION';
      tone: 'neutral';
      id: string;
      inspectionType: string;
      property: string | null;
      status: string;
      at: string | null;
    }
  | {
      kind: 'CHANNEL';
      tone: 'warning';
      id: string;
      channel: string;
      propertyCode: string | null;
      error: string | null;
      at: string;
    };

interface Week {
  start: string;
  leads: number | null;
  qualified: number | null;
  visits: number | null;
  proposals: number | null;
  screening: number | null;
  contracts: number | null;
  leases: number | null;
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
  properties: { available: number; archived: number; reserved: number } | null;
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
  queue: { items: QueueItem[]; total: number; attention: number };
  week: Week;
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

/** Data civil de São Paulo do dia (AAAA-MM-DD), para as colunas `date`. */
function saoPauloDate(day: Day): string {
  return new Date(day.start.getTime() + SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);
}

/** Segunda-feira, 00:00 em São Paulo, da semana do dia: oráculo independente do Intl. */
function saoPauloWeek(day: Day): Day {
  const wall = new Date(day.start.getTime() + SAO_PAULO_OFFSET_MS);
  const fromMonday = (wall.getUTCDay() + 6) % 7;
  const start = day.start.getTime() - fromMonday * DAY_MS;
  return { start: new Date(start), end: new Date(start + 7 * DAY_MS) };
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
      { orgId, title: 'Imóvel reservado', propertyType: 'APARTMENT', status: 'ACTIVE' },
    ])
    .returning();
  const p1 = must(propertyRows[0], 'imóvel 1');
  const p2 = must(propertyRows[1], 'imóvel 2');
  const archived = must(propertyRows[2], 'imóvel arquivado');
  const reserved = must(propertyRows[3], 'imóvel reservado');
  const party = must(
    (await db.insert(parties).values({ orgId, type: 'PERSON', name: 'Pessoa' }).returning())[0],
    'pessoa',
  );

  const listingRows = await db
    .insert(listings)
    .values([
      {
        orgId,
        propertyId: p1.id,
        title: 'Anúncio 1',
        slug: 'anuncio-1',
        // Slug público é único no país: cada semente precisa do seu.
        publicSlug: `anuncio-1-${randomUUID().slice(0, 8)}`,
        status: 'PUBLISHED',
      },
      {
        orgId,
        propertyId: p2.id,
        title: 'Anúncio 2',
        slug: 'anuncio-2',
        publicSlug: `anuncio-2-${randomUUID().slice(0, 8)}`,
        status: 'DRAFT',
      },
    ])
    .returning();
  const l1 = must(listingRows[0], 'anúncio 1');
  const l2 = must(listingRows[1], 'anúncio 2');
  await db.insert(listingChannelPublications).values([
    { orgId, listingId: l1.id, channel: 'fake', status: 'PUBLISHED' },
    { orgId, listingId: l1.id, channel: 'zap', status: 'FAILED' },
    { orgId, listingId: l2.id, channel: 'fake', status: 'FAILED' },
    { orgId, listingId: l2.id, channel: 'olx', status: 'PENDING' },
    // Feed do Grupo OLX (ADR-108): confirmado pelo relatório é ativa; recusado é falha.
    { orgId, listingId: l1.id, channel: 'grupoolx', status: 'IMPORTED' },
    {
      orgId,
      listingId: l2.id,
      channel: 'grupoolx',
      status: 'IMPORT_ERROR',
      issues: [{ code: 'REPORT_ERROR', message: 'Foto com marca d’água', blocking: true }],
    },
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
  // B14: "Reservados" é o imóvel ativo com proposta aceita e sem locação em vigor. O reservado
  // conta uma vez (duas aceitas); p1 tem locação ativa; o arquivado não está disponível.
  await db.insert(proposals).values(
    [reserved, reserved, p1, archived].map((property) => ({
      orgId,
      propertyId: property.id,
      status: 'ACCEPTED',
      monthlyRentCents: 100_000,
      validUntil: '2099-12-31',
      decidedAt: at(now),
    })),
  );
  // B14: enviada agora e vencendo hoje — entra na fila e no ciclo da semana.
  await db.insert(proposals).values({
    orgId,
    propertyId: p2.id,
    status: 'SENT',
    monthlyRentCents: 100_000,
    validUntil: saoPauloDate(day),
    sentAt: at(now),
  });

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
      // B14: a aberta de hoje entra na fila; a concluída de hoje, não.
      scheduledAt: status === 'DRAFT' || status === 'COMPLETED' ? laterToday : null,
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
      reserved: await n(
        sql`select count(distinct p.property_id) as n from proposals p join properties pr on pr.id = p.property_id where p.org_id = ${orgId} and p.status = 'ACCEPTED' and pr.status = 'ACTIVE' and not exists (select 1 from leases l where l.property_id = p.property_id and l.status in ('ACTIVE', 'DELINQUENT'))`,
      ),
    },
    listings: {
      publishedPublications: await n(
        sql`select count(*) as n from listing_channel_publications where org_id = ${orgId} and status in ('PUBLISHED', 'IMPORTED', 'IMPORTED_WITH_WARNINGS')`,
      ),
      failedPublications: await n(
        sql`select count(*) as n from listing_channel_publications where org_id = ${orgId} and status in ('FAILED', 'IMPORT_ERROR')`,
      ),
      failedByChannel: (
        await rows(
          app,
          sql`select channel, count(*) as failed from listing_channel_publications where org_id = ${orgId} and status in ('FAILED', 'IMPORT_ERROR') group by channel order by channel`,
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
    queue: await queueOracle(app, orgId, day),
    week: await weekOracle(app, orgId, day),
  };
}

/**
 * Fila da tela 32 (B14): por tipo, o total e os dois primeiros; na tela, um de cada tipo antes
 * de repetir, até cinco. Itens comparados como `TIPO:id`.
 */
async function queueOracle(app: FastifyInstance, orgId: string, day: Day) {
  const start = day.start.toISOString();
  const end = day.end.toISOString();
  const today = saoPauloDate(day);
  const kinds: Array<[string, SQL, SQL]> = [
    [
      'LEAD',
      sql`select count(*) as n from leads where org_id = ${orgId} and status = 'NEW'`,
      sql`select id from leads where org_id = ${orgId} and status = 'NEW' order by created_at asc, id asc limit 2`,
    ],
    [
      'VISIT',
      sql`select count(*) as n from visits where org_id = ${orgId} and status in ('SCHEDULED', 'CONFIRMED') and scheduled_at >= ${start}::timestamptz and scheduled_at < ${end}::timestamptz`,
      sql`select id from visits where org_id = ${orgId} and status in ('SCHEDULED', 'CONFIRMED') and scheduled_at >= ${start}::timestamptz and scheduled_at < ${end}::timestamptz order by scheduled_at asc, id asc limit 2`,
    ],
    [
      'PROPOSAL',
      sql`select count(*) as n from proposals where org_id = ${orgId} and status = 'SENT' and valid_until = ${today}::date`,
      sql`select id from proposals where org_id = ${orgId} and status = 'SENT' and valid_until = ${today}::date order by created_at asc, id asc limit 2`,
    ],
    [
      'INSPECTION',
      sql`select count(*) as n from inspections where org_id = ${orgId} and status in ('DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW') and scheduled_at >= ${start}::timestamptz and scheduled_at < ${end}::timestamptz`,
      sql`select id from inspections where org_id = ${orgId} and status in ('DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW') and scheduled_at >= ${start}::timestamptz and scheduled_at < ${end}::timestamptz order by scheduled_at asc, id asc limit 2`,
    ],
    [
      'CHANNEL',
      sql`select count(*) as n from listing_channel_publications where org_id = ${orgId} and status in ('FAILED', 'IMPORT_ERROR')`,
      sql`select id from listing_channel_publications where org_id = ${orgId} and status in ('FAILED', 'IMPORT_ERROR') order by updated_at desc, id asc limit 2`,
    ],
  ];
  const totals = new Map<string, number>();
  const firsts: string[][] = [];
  for (const [kind, total, first] of kinds) {
    totals.set(kind, await scalar(app, total));
    firsts.push((await ids(app, first)).map((id) => `${kind}:${id}`));
  }
  const items = [...firsts.map((list) => list[0]), ...firsts.map((list) => list[1])]
    .filter((item): item is string => item !== undefined)
    .slice(0, 5);
  const t = (kind: string) => totals.get(kind) ?? 0;
  return {
    items,
    total: t('LEAD') + t('VISIT') + t('PROPOSAL') + t('INSPECTION') + t('CHANNEL'),
    attention: t('LEAD') + t('PROPOSAL') + t('CHANNEL'),
  };
}

/** Ciclo de locação da semana (B14): cada etapa contada na semana de São Paulo. */
async function weekOracle(app: FastifyInstance, orgId: string, day: Day): Promise<Week> {
  const week = saoPauloWeek(day);
  const from = week.start.toISOString();
  const to = week.end.toISOString();
  const n = (query: SQL) => scalar(app, query);
  return {
    start: from,
    leads: await n(
      sql`select count(*) as n from leads where org_id = ${orgId} and created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz`,
    ),
    qualified: await n(
      sql`select count(*) as n from leads where org_id = ${orgId} and created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz and status in ('QUALIFIED', 'VISIT', 'PROPOSAL', 'APPLICATION', 'WON')`,
    ),
    visits: await n(
      sql`select count(*) as n from visits where org_id = ${orgId} and scheduled_at >= ${from}::timestamptz and scheduled_at < ${to}::timestamptz and status not in ('CANCELLED', 'NO_SHOW')`,
    ),
    proposals: await n(
      sql`select count(*) as n from proposals where org_id = ${orgId} and sent_at >= ${from}::timestamptz and sent_at < ${to}::timestamptz`,
    ),
    screening: await n(
      sql`select count(*) as n from rental_applications where org_id = ${orgId} and created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz`,
    ),
    contracts: await n(
      sql`select count(*) as n from contracts where org_id = ${orgId} and created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz and status <> 'VOID' and kind = 'LEASE'`,
    ),
    leases: await n(
      sql`select count(*) as n from leases where org_id = ${orgId} and created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz`,
    ),
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
    queue: {
      items: summary.queue.items.map((item) => `${item.kind}:${item.id}`),
      total: summary.queue.total,
      attention: summary.queue.attention,
    },
    week: summary.week,
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
    // B14: um reservado (as exclusões da semente valem), um item de cada tipo na fila e todas as
    // etapas do ciclo com dado nesta semana.
    expect(expected.properties.reserved).toBe(1);
    expect(expected.queue.items.map((item) => item.split(':')[0])).toEqual([
      'LEAD',
      'VISIT',
      'PROPOSAL',
      'INSPECTION',
      'CHANNEL',
    ]);
    // Canais: duas falhas de envio e uma recusa do relatório do Grupo OLX.
    expect(expected.queue.total).toBe(101 + 1 + 1 + 1 + 3);
    expect(expected.queue.attention).toBe(101 + 1 + 3);
    const { start: weekStart, ...stages } = expected.week;
    expect(weekStart).toBe(saoPauloWeek(day).start.toISOString());
    for (const [stage, value] of Object.entries(stages)) {
      expect(value, stage).toBeGreaterThan(0);
    }

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

  it('B14: os contadores do menu repetem os números do resumo', async () => {
    const semSessao = await app.inject({ method: 'GET', url: '/dashboard/counters' });
    expect(semSessao.statusCode).toBe(401);

    const resumo = await summaryOf(A.cookie);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/counters',
      headers: { cookie: A.cookie },
    });
    expect(res.statusCode).toBe(200);
    assertSeededDay(new Date(resumo.body.generatedAt));
    expect(res.json()).toEqual({
      leads: resumo.body.crm?.newLeadsToday,
      tasks: (resumo.body.tasks?.overdue ?? 0) + (resumo.body.tasks?.dueToday ?? 0),
      inbox: resumo.body.conversations?.needsHuman,
    });
  });

  it('B14: a fila traz o que a tela 32 mostra, um item de cada tipo', async () => {
    const C = await registerUser(app);
    const orgId = C.body.org.id;
    const db = app.db;
    const hoje = saoPauloDay(new Date());
    const as = (hora: number, minuto: number) =>
      new Date(hoje.start.getTime() + (hora * 60 + minuto) * 60_000);

    const imoveis = await db
      .insert(properties)
      .values([
        { orgId, title: 'Casa Jardim América', propertyType: 'HOUSE', status: 'ACTIVE' },
        { orgId, title: 'Apto 3 qts Marista', propertyType: 'APARTMENT', status: 'ACTIVE' },
        {
          orgId,
          title: 'Apto 804 Setor Marista',
          propertyType: 'APARTMENT',
          status: 'ACTIVE',
          code: 'IMV-0165',
        },
      ])
      .returning();
    const casa = must(imoveis[0], 'casa');
    const apto3 = must(imoveis[1], 'apto 3 qts');
    const apto804 = must(imoveis[2], 'apto 804');
    const pessoas = await db
      .insert(parties)
      .values(
        ['Mariana Costa', 'João Pereira', 'Carlos Dias'].map((name) => ({
          orgId,
          type: 'PERSON',
          name,
        })),
      )
      .returning();
    const lead = must(
      (
        await db
          .insert(leads)
          .values({
            orgId,
            partyId: must(pessoas[0], 'Mariana').id,
            status: 'NEW',
            channel: 'PORTAL',
            createdAt: new Date(Date.now() - 30 * 60_000),
          })
          .returning()
      )[0],
      'lead',
    );
    const visita = must(
      (
        await db
          .insert(visits)
          .values({
            orgId,
            partyId: must(pessoas[1], 'João').id,
            propertyId: casa.id,
            status: 'SCHEDULED',
            scheduledAt: as(10, 30),
          })
          .returning()
      )[0],
      'visita',
    );
    const proposta = must(
      (
        await db
          .insert(proposals)
          .values({
            orgId,
            partyId: must(pessoas[2], 'Carlos').id,
            propertyId: apto3.id,
            status: 'SENT',
            monthlyRentCents: 350_000,
            validUntil: saoPauloDate(hoje),
            sentAt: new Date(),
          })
          .returning()
      )[0],
      'proposta',
    );
    const vistoria = must(
      (
        await db
          .insert(inspections)
          .values({
            orgId,
            propertyId: apto804.id,
            type: 'CHECKIN',
            status: 'DRAFT',
            scheduledAt: as(14, 0),
          })
          .returning()
      )[0],
      'vistoria',
    );
    const anuncio = must(
      (
        await db
          .insert(listings)
          .values({
            orgId,
            propertyId: apto804.id,
            title: 'Apto 804 Setor Marista',
            slug: 'apto-804',
            publicSlug: `apto-804-${randomUUID().slice(0, 8)}`,
            status: 'PUBLISHED',
          })
          .returning()
      )[0],
      'anúncio',
    );
    const recusa = must(
      (
        await db
          .insert(listingChannelPublications)
          .values({
            orgId,
            listingId: anuncio.id,
            channel: 'olx',
            status: 'FAILED',
            lastError: 'foto abaixo do mínimo',
          })
          .returning()
      )[0],
      'publicação recusada',
    );

    const res = await summaryOf(C.cookie);
    expect(res.status).toBe(200);
    if (saoPauloDay(new Date(res.body.generatedAt)).start.getTime() !== hoje.start.getTime()) {
      throw new Error(
        'o dia virou (America/Sao_Paulo) entre semear e consultar — execute novamente',
      );
    }
    // A API devolve o dado; as frases ("sem retorno há 30 min", "Vence hoje") são do painel.
    expect(res.body.queue).toEqual({
      items: [
        {
          kind: 'LEAD',
          tone: 'danger',
          id: lead.id,
          name: 'Mariana Costa',
          source: null,
          channel: 'PORTAL',
          at: lead.createdAt.toISOString(),
        },
        {
          kind: 'VISIT',
          tone: 'neutral',
          id: visita.id,
          name: 'João Pereira',
          property: 'Casa Jardim América',
          status: 'SCHEDULED',
          at: as(10, 30).toISOString(),
        },
        {
          kind: 'PROPOSAL',
          tone: 'warning',
          id: proposta.id,
          name: 'Carlos Dias',
          property: 'Apto 3 qts Marista',
          validUntil: saoPauloDate(hoje),
        },
        {
          kind: 'INSPECTION',
          tone: 'neutral',
          id: vistoria.id,
          inspectionType: 'CHECKIN',
          property: 'Apto 804 Setor Marista',
          status: 'DRAFT',
          at: as(14, 0).toISOString(),
        },
        {
          kind: 'CHANNEL',
          tone: 'warning',
          id: recusa.id,
          channel: 'olx',
          propertyCode: 'IMV-0165',
          error: 'foto abaixo do mínimo',
          at: recusa.updatedAt.toISOString(),
        },
      ],
      // "5 item(ns) exigem atenção" e "3 pendências exigem atenção hoje.", como na tela.
      total: 5,
      attention: 3,
    });
  });

  it('Grupo OLX: a recusa do relatório entra na fila com o motivo; o bloqueio nosso, não', async () => {
    const D = await registerUser(app);
    const orgId = D.body.org.id;
    const db = app.db;
    const imovel = must(
      (
        await db
          .insert(properties)
          .values({
            orgId,
            title: 'Apto 1201 Setor Bueno',
            propertyType: 'APARTMENT',
            status: 'ACTIVE',
            code: 'IMV-0201',
          })
          .returning()
      )[0],
      'imóvel',
    );
    const anuncios = await db
      .insert(listings)
      .values(
        ['recusado', 'bloqueado', 'confirmado'].map((nome) => ({
          orgId,
          propertyId: imovel.id,
          title: `Apto 1201 ${nome}`,
          slug: `apto-1201-${nome}`,
          publicSlug: `apto-1201-${nome}-${randomUUID().slice(0, 8)}`,
          status: 'PUBLISHED',
        })),
      )
      .returning();
    const publicacoes = await db
      .insert(listingChannelPublications)
      .values([
        {
          orgId,
          listingId: must(anuncios[0], 'recusado').id,
          channel: 'grupoolx',
          status: 'IMPORT_ERROR',
          issues: [
            { code: 'REPORT_WARNING', message: 'Descrição curta', blocking: false },
            { code: 'REPORT_ERROR', message: 'Foto com marca d’água', blocking: true },
          ],
        },
        {
          orgId,
          listingId: must(anuncios[1], 'bloqueado').id,
          channel: 'grupoolx',
          status: 'BLOCKED',
          issues: [{ code: 'PHOTOS_MIN', message: 'Mínimo de 5 fotos', blocking: true }],
        },
        {
          orgId,
          listingId: must(anuncios[2], 'confirmado').id,
          channel: 'grupoolx',
          status: 'IMPORTED',
        },
      ])
      .returning();
    const recusa = must(publicacoes[0], 'publicação recusada');

    const res = await summaryOf(D.cookie);
    expect(res.status).toBe(200);
    expect(res.body.queue).toEqual({
      items: [
        {
          kind: 'CHANNEL',
          tone: 'warning',
          id: recusa.id,
          channel: 'grupoolx',
          propertyCode: 'IMV-0201',
          error: 'Foto com marca d’água',
          at: recusa.updatedAt.toISOString(),
        },
      ],
      total: 1,
      attention: 1,
    });
    expect(res.body.listings).toEqual({
      publishedPublications: 1,
      failedPublications: 1,
      failedByChannel: [{ channel: 'grupoolx', failed: 1 }],
    });
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
    // B14: a fila e o ciclo seguem a mesma regra, por tipo e por etapa.
    expect(owner.body.queue.items.some((item) => item.kind === 'INSPECTION')).toBe(true);
    expect(res.body.queue.items.some((item) => item.kind === 'INSPECTION')).toBe(false);
    expect(res.body.week.screening).toBeNull();
    expect(res.body.week.contracts).toBeNull();
    expect(res.body.week.leases).toBeNull();
    expect(res.body.week.leads).toBe(owner.body.week.leads);
  });
});
