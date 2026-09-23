import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { leases, listings, memberships, organizations, plans, properties } from '@aluguei/db';
import type { AppTx, DbExecutor } from '@aluguei/db';
import { BILLABLE_LEASE_STATUSES, DomainError, assertWithinPlanLimit } from '@aluguei/domain';
import type { PlanResource, PlanUsage } from '@aluguei/domain';

/**
 * Uso da imobiliária frente aos limites do plano. Contam: membros; imóveis que não
 * estão arquivados; anúncios publicados (pausar libera a vaga); locações em vigor
 * (encerrar libera a vaga).
 */
export async function countPlanUsage(
  db: DbExecutor,
  orgId: string,
  resource: PlanResource,
): Promise<number> {
  switch (resource) {
    case 'users': {
      const [row] = await db
        .select({ n: count() })
        .from(memberships)
        .where(eq(memberships.orgId, orgId));
      return row?.n ?? 0;
    }
    case 'properties': {
      const [row] = await db
        .select({ n: count() })
        .from(properties)
        .where(and(eq(properties.orgId, orgId), ne(properties.status, 'ARCHIVED')));
      return row?.n ?? 0;
    }
    case 'publishedListings': {
      const [row] = await db
        .select({ n: count() })
        .from(listings)
        .where(and(eq(listings.orgId, orgId), eq(listings.status, 'PUBLISHED')));
      return row?.n ?? 0;
    }
    case 'activeLeases': {
      const [row] = await db
        .select({ n: count() })
        .from(leases)
        .where(and(eq(leases.orgId, orgId), inArray(leases.status, [...BILLABLE_LEASE_STATUSES])));
      return row?.n ?? 0;
    }
  }
}

export async function loadPlanUsage(db: DbExecutor, orgId: string): Promise<PlanUsage> {
  return {
    users: await countPlanUsage(db, orgId, 'users'),
    properties: await countPlanUsage(db, orgId, 'properties'),
    publishedListings: await countPlanUsage(db, orgId, 'publishedListings'),
    activeLeases: await countPlanUsage(db, orgId, 'activeLeases'),
  };
}

/**
 * Dentro da transação que vai acrescentar o item: trava a linha da imobiliária
 * (serializa cadastros concorrentes da mesma organização), lê o plano e conta o
 * uso. No limite lança PLAN_LIMIT_REACHED (409) antes de qualquer escrita.
 */
export async function assertPlanAllowsOneMore(
  tx: AppTx,
  orgId: string,
  resource: PlanResource,
): Promise<void> {
  await tx.execute(
    sql`select ${organizations.id} from ${organizations} where ${organizations.id} = ${orgId} for update`,
  );
  const [plan] = await tx
    .select({
      maxUsers: plans.maxUsers,
      maxProperties: plans.maxProperties,
      maxPublishedListings: plans.maxPublishedListings,
      maxActiveLeases: plans.maxActiveLeases,
    })
    .from(organizations)
    .innerJoin(plans, eq(plans.id, organizations.planId))
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!plan) {
    throw new DomainError('NOT_FOUND', 'Organização não encontrada');
  }
  assertWithinPlanLimit(plan, resource, await countPlanUsage(tx, orgId, resource));
}
