import type { FastifyPluginAsync } from 'fastify';
import { and, asc, eq, gte, inArray, isNull, lt, ne, notInArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  charges,
  contracts,
  conversations,
  inspections,
  leads,
  leases,
  listingChannelPublications,
  payouts,
  properties,
  proposals,
  rentalApplications,
  tasks,
  visits,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { hasPermission } from '@aluguei/domain';
import type { Permission } from '@aluguei/domain';
import { requireAuth } from '../plugins/authz.js';

/**
 * GET /dashboard/summary — números da Visão Geral agregados no banco (P1-01,
 * auditoria 2026-09-10). A página buscava 12 listagens com `limit=200`, que a
 * API recusa (máximo 100): tudo virava zero e "Nenhuma pendência operacional"
 * com dados existentes. Tudo é filtrado pela organização da sessão; cada seção
 * só é calculada com a permissão de leitura correspondente e, sem ela, vem
 * `null` (a tela mostra "—", não zero). "Hoje" é o dia civil de São Paulo e
 * todas as comparações usam o mesmo instante, devolvido em `generatedAt`.
 */

const TIME_ZONE = 'America/Sao_Paulo';
const QUEUE_ITEMS = 8;
const UPCOMING_VISITS = 6;

const CLOSED_LEAD_STATUSES = ['WON', 'LOST'];
const AWAITING_LEAD_STATUSES = ['NEW', 'QUALIFYING'];
const INACTIVE_VISIT_STATUSES = ['CANCELLED', 'NO_SHOW'];
const UPCOMING_VISIT_STATUSES = ['SCHEDULED', 'CONFIRMED'];
const PENDING_SCREENING_STATUSES = ['SUBMITTED', 'SCREENING', 'MANUAL_REVIEW'];
const PENDING_CONTRACT_STATUSES = ['DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED'];
const AWAITING_SIGNATURE_STATUSES = ['SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED'];
const OPEN_INSPECTION_STATUSES = ['DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW'];
const ACTIVE_LEASE_STATUSES = ['ACTIVE', 'DELINQUENT'];
const OPEN_CONVERSATION_STATUSES = ['OPEN', 'ACTIVE', 'NEEDS_HUMAN'];

const count = z.number().int().nonnegative();

const dashboardSummarySchema = z.object({
  generatedAt: z.string(),
  today: z.object({ start: z.string(), end: z.string(), timeZone: z.string() }),
  crm: z
    .object({
      openLeads: count,
      newLeadsToday: count,
      leadsWithoutOwner: count,
      awaitingResponse: count,
      qualified: count,
    })
    .nullable(),
  tasks: z
    .object({
      overdue: count,
      dueToday: count,
      overdueItems: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          dueAt: z.string().nullable(),
          relatedEntityType: z.string().nullable(),
        }),
      ),
      dueTodayItems: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          dueAt: z.string().nullable(),
          relatedEntityType: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  visits: z
    .object({
      active: count,
      upcomingItems: z.array(
        z.object({
          id: z.string(),
          scheduledAt: z.string(),
          status: z.string(),
          propertyId: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  proposals: z.object({ nonDraft: count }).nullable(),
  properties: z.object({ available: count, archived: count }).nullable(),
  listings: z
    .object({
      publishedPublications: count,
      failedPublications: count,
      failedByChannel: z.array(z.object({ channel: z.string(), failed: count })),
    })
    .nullable(),
  screening: z.object({ total: count, pending: count }).nullable(),
  contracts: z.object({ nonVoid: count, pending: count, awaitingSignature: count }).nullable(),
  inspections: z.object({ open: count }).nullable(),
  finance: z
    .object({
      activeLeases: count,
      nonEndedLeases: count,
      scheduledCharges: count,
      openCharges: count,
      overdueCharges: count,
      overdueAmountCents: count,
      pendingPayouts: count,
      overdueItems: z.array(
        z.object({
          id: z.string(),
          amountCents: count,
          status: z.string(),
          dueDate: z.string(),
        }),
      ),
    })
    .nullable(),
  conversations: z.object({ open: count, needsHuman: count }).nullable(),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

interface Day {
  start: Date;
  end: Date;
}

const ZONED_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function zonedParts(date: Date) {
  const parts = ZONED_PARTS.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Instante UTC em que começa, em São Paulo, o dia civil informado. */
function startOfZonedDay(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  const local = zonedParts(new Date(guess));
  const offset =
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
    guess;
  return new Date(guess - offset);
}

/** Dia civil de São Paulo que contém `now` (fim exclusivo), pelo banco de fusos do ICU. */
export function saoPauloDay(now: Date): Day {
  const local = zonedParts(now);
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return {
    start: startOfZonedDay(local.year, local.month, local.day),
    end: startOfZonedDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  };
}

function all(...conditions: SQL[]): SQL {
  return and(...conditions) ?? sql`true`;
}

/** `count(*) filter (where …)` convertido para número (count devolve bigint). */
function countWhere(condition: SQL): SQL<number> {
  return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
}

const countAll = (): SQL<number> => sql<number>`count(*)`.mapWith(Number);

async function crmSection(db: AppDb, orgId: string, day: Day) {
  const [row] = await db
    .select({
      openLeads: countWhere(notInArray(leads.status, CLOSED_LEAD_STATUSES)),
      newLeadsToday: countWhere(all(gte(leads.createdAt, day.start), lt(leads.createdAt, day.end))),
      leadsWithoutOwner: countWhere(
        all(notInArray(leads.status, CLOSED_LEAD_STATUSES), isNull(leads.ownerUserId)),
      ),
      awaitingResponse: countWhere(inArray(leads.status, AWAITING_LEAD_STATUSES)),
      qualified: countWhere(eq(leads.status, 'QUALIFIED')),
    })
    .from(leads)
    .where(eq(leads.orgId, orgId));
  return {
    openLeads: row?.openLeads ?? 0,
    newLeadsToday: row?.newLeadsToday ?? 0,
    leadsWithoutOwner: row?.leadsWithoutOwner ?? 0,
    awaitingResponse: row?.awaitingResponse ?? 0,
    qualified: row?.qualified ?? 0,
  };
}

async function tasksSection(db: AppDb, orgId: string, day: Day, now: Date) {
  const overdue = all(eq(tasks.status, 'OPEN'), lt(tasks.dueAt, now));
  const dueToday = all(eq(tasks.status, 'OPEN'), gte(tasks.dueAt, now), lt(tasks.dueAt, day.end));
  const item = {
    id: tasks.id,
    title: tasks.title,
    dueAt: tasks.dueAt,
    relatedEntityType: tasks.relatedEntityType,
  };
  const [counts] = await db
    .select({ overdue: countWhere(overdue), dueToday: countWhere(dueToday) })
    .from(tasks)
    .where(eq(tasks.orgId, orgId));
  const itemsFor = async (condition: SQL) =>
    (
      await db
        .select(item)
        .from(tasks)
        .where(all(eq(tasks.orgId, orgId), condition))
        .orderBy(asc(tasks.dueAt), asc(tasks.id))
        .limit(QUEUE_ITEMS)
    ).map((row) => ({ ...row, dueAt: row.dueAt?.toISOString() ?? null }));
  return {
    overdue: counts?.overdue ?? 0,
    dueToday: counts?.dueToday ?? 0,
    overdueItems: await itemsFor(overdue),
    dueTodayItems: await itemsFor(dueToday),
  };
}

async function visitsSection(db: AppDb, orgId: string, day: Day) {
  const [counts] = await db
    .select({ active: countWhere(notInArray(visits.status, INACTIVE_VISIT_STATUSES)) })
    .from(visits)
    .where(eq(visits.orgId, orgId));
  const upcoming = await db
    .select({
      id: visits.id,
      scheduledAt: visits.scheduledAt,
      status: visits.status,
      propertyId: visits.propertyId,
    })
    .from(visits)
    .where(
      all(
        eq(visits.orgId, orgId),
        inArray(visits.status, UPCOMING_VISIT_STATUSES),
        gte(visits.scheduledAt, day.start),
      ),
    )
    .orderBy(asc(visits.scheduledAt), asc(visits.id))
    .limit(UPCOMING_VISITS);
  return {
    active: counts?.active ?? 0,
    upcomingItems: upcoming.map((row) => ({ ...row, scheduledAt: row.scheduledAt.toISOString() })),
  };
}

async function listingsSection(db: AppDb, orgId: string) {
  const publications = listingChannelPublications;
  const [counts] = await db
    .select({
      publishedPublications: countWhere(eq(publications.status, 'PUBLISHED')),
      failedPublications: countWhere(eq(publications.status, 'FAILED')),
    })
    .from(publications)
    .where(eq(publications.orgId, orgId));
  const failedByChannel = await db
    .select({ channel: publications.channel, failed: countAll() })
    .from(publications)
    .where(all(eq(publications.orgId, orgId), eq(publications.status, 'FAILED')))
    .groupBy(publications.channel)
    .orderBy(asc(publications.channel));
  return {
    publishedPublications: counts?.publishedPublications ?? 0,
    failedPublications: counts?.failedPublications ?? 0,
    failedByChannel,
  };
}

async function financeSection(db: AppDb, orgId: string) {
  const [leaseCounts] = await db
    .select({
      activeLeases: countWhere(inArray(leases.status, ACTIVE_LEASE_STATUSES)),
      nonEndedLeases: countWhere(ne(leases.status, 'ENDED')),
    })
    .from(leases)
    .where(eq(leases.orgId, orgId));
  const [chargeCounts] = await db
    .select({
      scheduledCharges: countWhere(eq(charges.status, 'SCHEDULED')),
      openCharges: countWhere(eq(charges.status, 'OPEN')),
      overdueCharges: countWhere(eq(charges.status, 'OVERDUE')),
      overdueAmountCents:
        sql<number>`coalesce(sum(${charges.amountCents}) filter (where ${eq(charges.status, 'OVERDUE')}), 0)`.mapWith(
          Number,
        ),
    })
    .from(charges)
    .where(eq(charges.orgId, orgId));
  const [payoutCounts] = await db
    .select({ pendingPayouts: countWhere(eq(payouts.status, 'PENDING')) })
    .from(payouts)
    .where(eq(payouts.orgId, orgId));
  const overdueItems = await db
    .select({
      id: charges.id,
      amountCents: charges.amountCents,
      status: charges.status,
      dueDate: charges.dueDate,
    })
    .from(charges)
    .where(all(eq(charges.orgId, orgId), eq(charges.status, 'OVERDUE')))
    .orderBy(asc(charges.dueDate), asc(charges.id))
    .limit(QUEUE_ITEMS);
  return {
    activeLeases: leaseCounts?.activeLeases ?? 0,
    nonEndedLeases: leaseCounts?.nonEndedLeases ?? 0,
    scheduledCharges: chargeCounts?.scheduledCharges ?? 0,
    openCharges: chargeCounts?.openCharges ?? 0,
    overdueCharges: chargeCounts?.overdueCharges ?? 0,
    overdueAmountCents: chargeCounts?.overdueAmountCents ?? 0,
    pendingPayouts: payoutCounts?.pendingPayouts ?? 0,
    overdueItems,
  };
}

export const dashboardRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/dashboard/summary', async (request) => {
    const auth = requireAuth(request);
    const orgId = auth.orgId;
    const now = new Date();
    const day = saoPauloDay(now);
    const can = (permission: Permission): boolean => hasPermission(auth.role, permission);

    const [
      crm,
      taskSummary,
      visitSummary,
      proposalSummary,
      propertySummary,
      listingSummary,
      screening,
      contractSummary,
      inspectionSummary,
      finance,
      conversationSummary,
    ] = await Promise.all([
      can('lead:read') ? crmSection(db, orgId, day) : null,
      can('task:read') ? tasksSection(db, orgId, day, now) : null,
      can('visit:read') ? visitsSection(db, orgId, day) : null,
      can('proposal:read')
        ? db
            .select({ nonDraft: countWhere(ne(proposals.status, 'DRAFT')) })
            .from(proposals)
            .where(eq(proposals.orgId, orgId))
            .then(([row]) => ({ nonDraft: row?.nonDraft ?? 0 }))
        : null,
      can('property:read')
        ? db
            .select({
              available: countWhere(eq(properties.status, 'ACTIVE')),
              archived: countWhere(eq(properties.status, 'ARCHIVED')),
            })
            .from(properties)
            .where(eq(properties.orgId, orgId))
            .then(([row]) => ({ available: row?.available ?? 0, archived: row?.archived ?? 0 }))
        : null,
      can('listing:read') ? listingsSection(db, orgId) : null,
      can('screening:read')
        ? db
            .select({
              total: countAll(),
              pending: countWhere(inArray(rentalApplications.status, PENDING_SCREENING_STATUSES)),
            })
            .from(rentalApplications)
            .where(eq(rentalApplications.orgId, orgId))
            .then(([row]) => ({ total: row?.total ?? 0, pending: row?.pending ?? 0 }))
        : null,
      can('contract:read')
        ? db
            .select({
              nonVoid: countWhere(ne(contracts.status, 'VOID')),
              pending: countWhere(inArray(contracts.status, PENDING_CONTRACT_STATUSES)),
              awaitingSignature: countWhere(inArray(contracts.status, AWAITING_SIGNATURE_STATUSES)),
            })
            .from(contracts)
            .where(eq(contracts.orgId, orgId))
            .then(([row]) => ({
              nonVoid: row?.nonVoid ?? 0,
              pending: row?.pending ?? 0,
              awaitingSignature: row?.awaitingSignature ?? 0,
            }))
        : null,
      can('inspection:read')
        ? db
            .select({ open: countWhere(inArray(inspections.status, OPEN_INSPECTION_STATUSES)) })
            .from(inspections)
            .where(eq(inspections.orgId, orgId))
            .then(([row]) => ({ open: row?.open ?? 0 }))
        : null,
      can('finance:read') ? financeSection(db, orgId) : null,
      can('conversation:read')
        ? db
            .select({
              open: countWhere(inArray(conversations.status, OPEN_CONVERSATION_STATUSES)),
              needsHuman: countWhere(eq(conversations.status, 'NEEDS_HUMAN')),
            })
            .from(conversations)
            .where(eq(conversations.orgId, orgId))
            .then(([row]) => ({ open: row?.open ?? 0, needsHuman: row?.needsHuman ?? 0 }))
        : null,
    ]);

    return dashboardSummarySchema.parse({
      generatedAt: now.toISOString(),
      today: { start: day.start.toISOString(), end: day.end.toISOString(), timeZone: TIME_ZONE },
      crm,
      tasks: taskSummary,
      visits: visitSummary,
      proposals: proposalSummary,
      properties: propertySummary,
      listings: listingSummary,
      screening,
      contracts: contractSummary,
      inspections: inspectionSummary,
      finance,
      conversations: conversationSummary,
    });
  });

  return Promise.resolve();
};
