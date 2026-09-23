import { DomainError } from '../errors.js';

/** Limites de um plano (sem cobrança). `null` é ilimitado. */
export interface PlanLimits {
  maxUsers: number | null;
  maxProperties: number | null;
  maxPublishedListings: number | null;
  /** Locações em vigor (ACTIVE, DELINQUENT ou TERMINATING). */
  maxActiveLeases: number | null;
}

export const PLAN_RESOURCES = ['users', 'properties', 'publishedListings', 'activeLeases'] as const;
export type PlanResource = (typeof PLAN_RESOURCES)[number];

export type PlanUsage = Record<PlanResource, number>;

const RESOURCE_LABELS: Record<PlanResource, string> = {
  users: 'usuários',
  properties: 'imóveis',
  publishedListings: 'anúncios publicados',
  activeLeases: 'locações ativas',
};

export function planLimitFor(limits: PlanLimits, resource: PlanResource): number | null {
  switch (resource) {
    case 'users':
      return limits.maxUsers;
    case 'properties':
      return limits.maxProperties;
    case 'publishedListings':
      return limits.maxPublishedListings;
    case 'activeLeases':
      return limits.maxActiveLeases;
  }
}

/**
 * Recusa acrescentar mais um item quando o uso atual já alcançou o limite.
 * Um plano rebaixado abaixo do uso não apaga nada: só bloqueia novos itens.
 */
export function assertWithinPlanLimit(
  limits: PlanLimits,
  resource: PlanResource,
  current: number,
): void {
  const limit = planLimitFor(limits, resource);
  if (limit !== null && current >= limit) {
    throw new DomainError(
      'PLAN_LIMIT_REACHED',
      `Limite do plano atingido: ${String(limit)} ${RESOURCE_LABELS[resource]}`,
      { resource, limit, current },
    );
  }
}

/** Recursos com uso acima do limite (depois de uma troca de plano). */
export function planResourcesOverLimit(limits: PlanLimits, usage: PlanUsage): PlanResource[] {
  return PLAN_RESOURCES.filter((resource) => {
    const limit = planLimitFor(limits, resource);
    return limit !== null && usage[resource] > limit;
  });
}
