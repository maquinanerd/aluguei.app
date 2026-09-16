import type { BadgeTone } from '@aluguei/ui';
import type { OrganizationStatus } from './account-status';

/** Tipos e rótulos do admin da plataforma (shape das rotas `/platform`). Módulo puro. */

export type PlanResource = 'users' | 'properties' | 'publishedListings';

export interface PlanLimitsDto {
  maxUsers: number | null;
  maxProperties: number | null;
  maxPublishedListings: number | null;
}

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  document: string | null;
  phone: string | null;
  creci: string | null;
  createdAt: string;
  plan: PlanLimitsDto & { id: string; code: string; name: string; isActive: boolean };
  owner: { name: string; email: string } | null;
  usage: Record<PlanResource, number>;
  overLimit: PlanResource[];
}

export interface PlatformOrganizationList {
  organizations: PlatformOrganization[];
  total: number;
  counts: Record<OrganizationStatus, number>;
}

export interface PlatformOrganizationDetail {
  organization: PlatformOrganization;
  members: Array<{ userId: string; name: string; email: string; role: string }>;
  events: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    payload: Record<string, unknown>;
    occurredAt: string;
  }>;
}

export interface PlatformPlan extends PlanLimitsDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  organizationCount: number;
}

export const PLAN_RESOURCES: readonly PlanResource[] = ['users', 'properties', 'publishedListings'];

export const PLAN_RESOURCE_LABELS: Record<PlanResource, string> = {
  users: 'Usuários',
  properties: 'Imóveis',
  publishedListings: 'Anúncios publicados',
};

export const ORGANIZATION_STATUS_TONES: Record<OrganizationStatus, BadgeTone> = {
  PENDING_APPROVAL: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  REJECTED: 'neutral',
};

const EVENT_LABELS: Record<string, string> = {
  'auth.register': 'Cadastro recebido',
  'platform.organization.approved': 'Aprovada',
  'platform.organization.rejected': 'Recusada',
  'platform.organization.suspended': 'Suspensa',
  'platform.organization.reactivated': 'Reativada',
  'platform.organization.plan_changed': 'Plano alterado',
};

export function eventLabel(action: string): string {
  return EVENT_LABELS[action] ?? action;
}

export function limitFor(limits: PlanLimitsDto, resource: PlanResource): number | null {
  switch (resource) {
    case 'users':
      return limits.maxUsers;
    case 'properties':
      return limits.maxProperties;
    case 'publishedListings':
      return limits.maxPublishedListings;
  }
}

export function formatLimit(max: number | null): string {
  return max === null ? 'Ilimitado' : max.toLocaleString('pt-BR');
}

/** "3 de 50" ou só "3" quando o plano não limita. */
export function usageLabel(used: number, max: number | null): string {
  return max === null
    ? used.toLocaleString('pt-BR')
    : `${used.toLocaleString('pt-BR')} de ${max.toLocaleString('pt-BR')}`;
}

/** Limite digitado no formulário de plano: vazio é ilimitado; senão inteiro ≥ mínimo. */
export function parseLimitInput(
  text: string,
  minimum: number,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: 'Use um número inteiro ou deixe vazio para ilimitado' };
  }
  const value = Number(trimmed);
  if (value < minimum) {
    return { ok: false, message: `O mínimo é ${String(minimum)}` };
  }
  if (value > 1_000_000) {
    return { ok: false, message: 'O máximo é 1.000.000' };
  }
  return { ok: true, value };
}
