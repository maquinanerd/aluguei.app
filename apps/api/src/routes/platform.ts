import { and, asc, count, desc, eq, getTableColumns, ilike, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { auditEvents, memberships, organizations, plans, users } from '@aluguei/db';
import type { AppDb, DbExecutor } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  ORGANIZATION_STATUSES,
  isOrganizationStatus,
  organizationActionRequiresReason,
  normalizePlanModules,
  organizationStatusAfter,
  planResourcesOverLimit,
} from '@aluguei/domain';
import type { OrganizationAction, OrganizationStatus } from '@aluguei/domain';
import {
  approveOrganizationRequestSchema,
  changeOrganizationPlanRequestSchema,
  createPlanRequestSchema,
  listPlansResponseSchema,
  listPlatformOrganizationsQuerySchema,
  listPlatformOrganizationsResponseSchema,
  planResponseSchema,
  platformOrganizationDetailResponseSchema,
  platformOrganizationResponseSchema,
  rejectOrganizationRequestSchema,
  suspendOrganizationRequestSchema,
  updatePlanRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requirePlatformAdmin } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

/**
 * Admin da plataforma (decisão do usuário de 2026-09-15): imobiliárias do cadastro
 * aberto, aprovação, recusa, suspensão e planos com limites, sem cobrança. Toda
 * rota exige um e-mail da allowlist `PLATFORM_ADMIN_EMAILS`.
 */

const STATUS_AUDIT_ACTION: Record<OrganizationAction, string> = {
  APPROVE: AUDIT_ACTIONS.PLATFORM_ORG_APPROVED,
  REJECT: AUDIT_ACTIONS.PLATFORM_ORG_REJECTED,
  SUSPEND: AUDIT_ACTIONS.PLATFORM_ORG_SUSPENDED,
  REACTIVATE: AUDIT_ACTIONS.PLATFORM_ORG_REACTIVATED,
};

/** `%`, `_` e `\` do texto de busca viram literais no ILIKE. */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Mesmas regras de uso de `countPlanUsage` (platform/usage.ts), em subconsulta para a listagem.
const organizationColumns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  status: organizations.status,
  statusReason: organizations.statusReason,
  statusChangedAt: organizations.statusChangedAt,
  document: organizations.document,
  phone: organizations.phone,
  creci: organizations.creci,
  createdAt: organizations.createdAt,
  planId: plans.id,
  planCode: plans.code,
  planName: plans.name,
  planMaxUsers: plans.maxUsers,
  planMaxProperties: plans.maxProperties,
  planMaxPublishedListings: plans.maxPublishedListings,
  planMaxActiveLeases: plans.maxActiveLeases,
  planModules: plans.modules,
  planMonthlyPriceCents: plans.monthlyPriceCents,
  planIsActive: plans.isActive,
  ownerName: sql<string | null>`(
    select u.name from memberships m join users u on u.id = m.user_id
    where m.org_id = ${organizations.id} and m.role = 'owner'
    order by m.created_at asc limit 1)`,
  ownerEmail: sql<string | null>`(
    select u.email from memberships m join users u on u.id = m.user_id
    where m.org_id = ${organizations.id} and m.role = 'owner'
    order by m.created_at asc limit 1)`,
  usersCount: sql<number>`(select count(*)::int from memberships m where m.org_id = ${organizations.id})`,
  propertiesCount: sql<number>`(
    select count(*)::int from properties p
    where p.org_id = ${organizations.id} and p.status <> 'ARCHIVED')`,
  publishedListingsCount: sql<number>`(
    select count(*)::int from listings l
    where l.org_id = ${organizations.id} and l.status = 'PUBLISHED')`,
  // Locações em vigor: as mesmas de BILLABLE_LEASE_STATUSES (encerrar libera a vaga).
  activeLeasesCount: sql<number>`(
    select count(*)::int from leases le
    where le.org_id = ${organizations.id} and le.status in ('ACTIVE', 'DELINQUENT', 'TERMINATING'))`,
};

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  statusReason: string | null;
  statusChangedAt: Date | null;
  document: string | null;
  phone: string | null;
  creci: string | null;
  createdAt: Date;
  planId: string;
  planCode: string;
  planName: string;
  planMaxUsers: number | null;
  planMaxProperties: number | null;
  planMaxPublishedListings: number | null;
  planMaxActiveLeases: number | null;
  planModules: string[];
  planMonthlyPriceCents: number | null;
  planIsActive: boolean;
  ownerName: string | null;
  ownerEmail: string | null;
  usersCount: number;
  propertiesCount: number;
  publishedListingsCount: number;
  activeLeasesCount: number;
}

function toPlatformOrganization(row: OrganizationRow) {
  const limits = {
    maxUsers: row.planMaxUsers,
    maxProperties: row.planMaxProperties,
    maxPublishedListings: row.planMaxPublishedListings,
    maxActiveLeases: row.planMaxActiveLeases,
  };
  const usage = {
    users: row.usersCount,
    properties: row.propertiesCount,
    publishedListings: row.publishedListingsCount,
    activeLeases: row.activeLeasesCount,
  };
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    statusReason: row.statusReason,
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    document: row.document,
    phone: row.phone,
    creci: row.creci,
    createdAt: row.createdAt.toISOString(),
    plan: {
      id: row.planId,
      code: row.planCode,
      name: row.planName,
      ...limits,
      modules: normalizePlanModules(row.planModules),
      monthlyPriceCents: row.planMonthlyPriceCents,
      isActive: row.planIsActive,
    },
    owner: row.ownerEmail ? { name: row.ownerName ?? '', email: row.ownerEmail } : null,
    usage,
    overLimit: planResourcesOverLimit(limits, usage),
  };
}

async function loadPlatformOrganization(db: DbExecutor, id: string) {
  const [row] = await db
    .select(organizationColumns)
    .from(organizations)
    .innerJoin(plans, eq(plans.id, organizations.planId))
    .where(eq(organizations.id, id))
    .limit(1);
  if (!row) {
    throw new DomainError('NOT_FOUND', 'Imobiliária não encontrada');
  }
  return toPlatformOrganization(row);
}

const planColumns = {
  ...getTableColumns(plans),
  organizationCount: sql<number>`(select count(*)::int from organizations o where o.plan_id = ${plans.id})`,
};

type PlanRow = typeof plans.$inferSelect & { organizationCount: number };

function toPlanDto(row: PlanRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    maxUsers: row.maxUsers,
    maxProperties: row.maxProperties,
    maxPublishedListings: row.maxPublishedListings,
    maxActiveLeases: row.maxActiveLeases,
    modules: normalizePlanModules(row.modules),
    monthlyPriceCents: row.monthlyPriceCents,
    isActive: row.isActive,
    organizationCount: row.organizationCount,
  };
}

async function loadPlan(db: DbExecutor, id: string) {
  const [row] = await db.select(planColumns).from(plans).where(eq(plans.id, id)).limit(1);
  if (!row) {
    throw new DomainError('NOT_FOUND', 'Plano não encontrado');
  }
  return toPlanDto(row);
}

/** Plano atribuível: existe e está ativo (desativado só continua onde já estava). */
async function assertAssignablePlan(db: DbExecutor, planId: string): Promise<void> {
  const [plan] = await db
    .select({ isActive: plans.isActive })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);
  if (!plan) {
    throw new DomainError('NOT_FOUND', 'Plano não encontrado');
  }
  if (!plan.isActive) {
    throw new DomainError('CONFLICT', 'Plano desativado não pode ser atribuído');
  }
}

export const platformRoutes: FastifyPluginAsync = (app) => {
  const db: AppDb = app.db;

  async function changeStatus(
    request: FastifyRequest,
    action: OrganizationAction,
    input: { reason?: string; planId?: string },
  ) {
    const admin = requirePlatformAdmin(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const reason = organizationActionRequiresReason(action) ? (input.reason ?? null) : null;

    await db.transaction(async (tx) => {
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .for('update');
      if (!org) {
        throw new DomainError('NOT_FOUND', 'Imobiliária não encontrada');
      }
      if (!isOrganizationStatus(org.status)) {
        throw new Error(`status de organização inválido: ${org.status}`);
      }
      const next = organizationStatusAfter(action, org.status);
      const planChanged = input.planId !== undefined && input.planId !== org.planId;
      if (planChanged && input.planId !== undefined) {
        await assertAssignablePlan(tx, input.planId);
      }
      const now = new Date();
      await tx
        .update(organizations)
        .set({
          status: next,
          statusReason: reason,
          statusChangedAt: now,
          statusChangedBy: admin.userId,
          ...(planChanged ? { planId: input.planId } : {}),
          updatedAt: now,
        })
        .where(eq(organizations.id, id));
      await writeAudit(tx, {
        orgId: id,
        actorUserId: admin.userId,
        action: STATUS_AUDIT_ACTION[action],
        entityType: 'ORGANIZATION',
        entityId: id,
        payload: {
          from: org.status,
          to: next,
          ...(reason !== null ? { reason } : {}),
          ...(planChanged ? { fromPlanId: org.planId, toPlanId: input.planId } : {}),
        },
      });
    });

    return platformOrganizationResponseSchema.parse({
      organization: await loadPlatformOrganization(db, id),
    });
  }

  app.get('/platform/organizations', async (request) => {
    requirePlatformAdmin(request);
    const query = listPlatformOrganizationsQuerySchema.parse(request.query);

    const filters: SQL[] = [];
    if (query.status) {
      filters.push(eq(organizations.status, query.status));
    }
    if (query.q) {
      const pattern = `%${escapeLikePattern(query.q)}%`;
      const digits = query.q.replace(/\D/g, '');
      const matches: SQL[] = [
        ilike(organizations.name, pattern),
        ilike(organizations.slug, pattern),
        sql`exists (
          select 1 from memberships m join users u on u.id = m.user_id
          where m.org_id = ${organizations.id} and u.email ilike ${pattern})`,
      ];
      if (digits.length >= 3) {
        matches.push(like(organizations.document, `%${digits}%`));
      }
      const anyMatch = or(...matches);
      if (anyMatch) {
        filters.push(anyMatch);
      }
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await db
      .select(organizationColumns)
      .from(organizations)
      .innerJoin(plans, eq(plans.id, organizations.planId))
      .where(where)
      // Fila de aprovação: quem chegou primeiro; demais listas: mais recentes primeiro.
      .orderBy(
        query.status === 'PENDING_APPROVAL'
          ? asc(organizations.createdAt)
          : desc(organizations.createdAt),
        asc(organizations.id),
      )
      .limit(query.limit)
      .offset(query.offset);
    const [total] = await db.select({ n: count() }).from(organizations).where(where);
    const byStatus = await db
      .select({ status: organizations.status, n: count() })
      .from(organizations)
      .groupBy(organizations.status);

    const counts = Object.fromEntries(ORGANIZATION_STATUSES.map((status) => [status, 0])) as Record<
      OrganizationStatus,
      number
    >;
    for (const row of byStatus) {
      if (isOrganizationStatus(row.status)) {
        counts[row.status] = row.n;
      }
    }

    return listPlatformOrganizationsResponseSchema.parse({
      organizations: rows.map(toPlatformOrganization),
      total: total?.n ?? 0,
      counts,
    });
  });

  app.get('/platform/organizations/:id', async (request) => {
    requirePlatformAdmin(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const organization = await loadPlatformOrganization(db, id);

    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, id))
      .orderBy(asc(memberships.createdAt));

    const events = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorEmail: users.email,
        payload: auditEvents.payload,
        occurredAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(
        and(
          eq(auditEvents.orgId, id),
          or(
            like(auditEvents.action, 'platform.%'),
            eq(auditEvents.action, AUDIT_ACTIONS.AUTH_REGISTER),
          ),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt))
      .limit(50);

    return platformOrganizationDetailResponseSchema.parse({
      organization,
      members,
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        actorEmail: event.actorEmail,
        payload: (event.payload ?? {}) as Record<string, unknown>,
        occurredAt: event.occurredAt.toISOString(),
      })),
    });
  });

  app.post('/platform/organizations/:id/approve', async (request) => {
    requirePlatformAdmin(request);
    const input = approveOrganizationRequestSchema.parse(request.body ?? {});
    return changeStatus(
      request,
      'APPROVE',
      input.planId !== undefined ? { planId: input.planId } : {},
    );
  });

  app.post('/platform/organizations/:id/reject', async (request) => {
    requirePlatformAdmin(request);
    const input = rejectOrganizationRequestSchema.parse(request.body ?? {});
    return changeStatus(request, 'REJECT', { reason: input.reason });
  });

  app.post('/platform/organizations/:id/suspend', async (request) => {
    requirePlatformAdmin(request);
    const input = suspendOrganizationRequestSchema.parse(request.body ?? {});
    return changeStatus(request, 'SUSPEND', { reason: input.reason });
  });

  app.post('/platform/organizations/:id/reactivate', async (request) =>
    changeStatus(request, 'REACTIVATE', {}),
  );

  app.put('/platform/organizations/:id/plan', async (request) => {
    const admin = requirePlatformAdmin(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const input = changeOrganizationPlanRequestSchema.parse(request.body);

    await db.transaction(async (tx) => {
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .for('update');
      if (!org) {
        throw new DomainError('NOT_FOUND', 'Imobiliária não encontrada');
      }
      if (org.planId === input.planId) {
        return;
      }
      // Rebaixar abaixo do uso é permitido: nada é apagado, só novos cadastros param.
      await assertAssignablePlan(tx, input.planId);
      await tx
        .update(organizations)
        .set({ planId: input.planId, updatedAt: new Date() })
        .where(eq(organizations.id, id));
      await writeAudit(tx, {
        orgId: id,
        actorUserId: admin.userId,
        action: AUDIT_ACTIONS.PLATFORM_ORG_PLAN_CHANGED,
        entityType: 'ORGANIZATION',
        entityId: id,
        payload: { fromPlanId: org.planId, toPlanId: input.planId },
      });
    });

    return platformOrganizationResponseSchema.parse({
      organization: await loadPlatformOrganization(db, id),
    });
  });

  app.get('/platform/plans', async (request) => {
    requirePlatformAdmin(request);
    const rows = await db
      .select(planColumns)
      .from(plans)
      .orderBy(asc(plans.createdAt), asc(plans.code));
    return listPlansResponseSchema.parse({ plans: rows.map(toPlanDto) });
  });

  app.post('/platform/plans', async (request, reply) => {
    const admin = requirePlatformAdmin(request);
    const input = createPlanRequestSchema.parse(request.body);
    const plan = first(
      await db
        .insert(plans)
        .values({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          maxUsers: input.maxUsers,
          maxProperties: input.maxProperties,
          maxPublishedListings: input.maxPublishedListings,
          maxActiveLeases: input.maxActiveLeases ?? null,
          modules: normalizePlanModules(input.modules ?? []),
          monthlyPriceCents: input.monthlyPriceCents ?? null,
        })
        .returning(),
    );
    await writeAudit(db, {
      actorUserId: admin.userId,
      action: AUDIT_ACTIONS.PLATFORM_PLAN_CREATED,
      entityType: 'PLAN',
      entityId: plan.id,
      payload: { code: plan.code },
    });
    return reply.status(201).send(planResponseSchema.parse({ plan: await loadPlan(db, plan.id) }));
  });

  app.patch('/platform/plans/:id', async (request) => {
    const admin = requirePlatformAdmin(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const input = updatePlanRequestSchema.parse(request.body ?? {});
    const current = await loadPlan(db, id);

    const patch: Partial<typeof plans.$inferInsert> = {};
    for (const key of [
      'name',
      'description',
      'maxUsers',
      'maxProperties',
      'maxPublishedListings',
      'maxActiveLeases',
      'modules',
      'monthlyPriceCents',
      'isActive',
    ] as const) {
      if (input[key] !== undefined) {
        Object.assign(patch, { [key]: input[key] });
      }
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(plans)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(plans.id, id));
      await writeAudit(db, {
        actorUserId: admin.userId,
        action: AUDIT_ACTIONS.PLATFORM_PLAN_UPDATED,
        entityType: 'PLAN',
        entityId: id,
        payload: { code: current.code, changes: patch },
      });
    }
    return planResponseSchema.parse({ plan: await loadPlan(db, id) });
  });

  return Promise.resolve();
};
