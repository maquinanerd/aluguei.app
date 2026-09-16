import { DomainError } from '../errors.js';

/**
 * Situação da imobiliária na plataforma. Cadastro aberto nasce PENDING_APPROVAL e
 * só opera (painel, portal, site público) em ACTIVE — decisão do usuário de
 * 2026-09-15: cadastro aberto com aprovação por um admin da plataforma.
 */
export const ORGANIZATION_STATUSES = [
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_ACTIONS = ['APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE'] as const;
export type OrganizationAction = (typeof ORGANIZATION_ACTIONS)[number];

const TRANSITIONS: Record<
  OrganizationAction,
  { from: readonly OrganizationStatus[]; to: OrganizationStatus }
> = {
  APPROVE: { from: ['PENDING_APPROVAL', 'REJECTED'], to: 'ACTIVE' },
  REJECT: { from: ['PENDING_APPROVAL'], to: 'REJECTED' },
  SUSPEND: { from: ['ACTIVE'], to: 'SUSPENDED' },
  REACTIVATE: { from: ['SUSPENDED'], to: 'ACTIVE' },
};

export function isOrganizationStatus(value: unknown): value is OrganizationStatus {
  return typeof value === 'string' && (ORGANIZATION_STATUSES as readonly string[]).includes(value);
}

/** Status resultante da ação; fora da origem permitida lança INVALID_TRANSITION. */
export function organizationStatusAfter(
  action: OrganizationAction,
  from: OrganizationStatus,
): OrganizationStatus {
  const transition = TRANSITIONS[action];
  if (!transition.from.includes(from)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `Não é possível ${ACTION_LABELS[action]} uma imobiliária com status ${from}`,
      { action, from },
    );
  }
  return transition.to;
}

const ACTION_LABELS: Record<OrganizationAction, string> = {
  APPROVE: 'aprovar',
  REJECT: 'recusar',
  SUSPEND: 'suspender',
  REACTIVATE: 'reativar',
};

/** Recusar e suspender pedem motivo, que fica visível para a própria imobiliária. */
export function organizationActionRequiresReason(action: OrganizationAction): boolean {
  return action === 'REJECT' || action === 'SUSPEND';
}

export function organizationCanOperate(status: OrganizationStatus): boolean {
  return status === 'ACTIVE';
}
