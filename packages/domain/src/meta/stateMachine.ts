/** Máquinas de estado do fluxo de anúncios Meta. */

import { DomainError } from '../errors.js';

export type AdProfileStatus =
  'DRAFT' | 'PREPARED' | 'CREATED' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';
export type CampaignStatus = 'CREATED_PAUSED' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

/** Transições válidas do AdProfile local. */
const AD_PROFILE_TRANSITIONS: Record<AdProfileStatus, readonly AdProfileStatus[]> = {
  DRAFT: ['PREPARED', 'ARCHIVED'],
  PREPARED: ['CREATED', 'ARCHIVED'],
  CREATED: ['PUBLISHED', 'PAUSED', 'ARCHIVED'],
  PUBLISHED: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: [],
};

/** Transições da campanha espelhada (nunca ACTIVE sem ação explícita de runtime). */
const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  CREATED_PAUSED: ['ACTIVE', 'PAUSED', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

function isAdProfileStatus(value: string): value is AdProfileStatus {
  return Object.prototype.hasOwnProperty.call(AD_PROFILE_TRANSITIONS, value);
}

function isCampaignStatus(value: string): value is CampaignStatus {
  return Object.prototype.hasOwnProperty.call(CAMPAIGN_TRANSITIONS, value);
}

export function canTransitionAdProfile(from: AdProfileStatus, to: AdProfileStatus): boolean {
  return AD_PROFILE_TRANSITIONS[from].includes(to);
}

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

export function transitionAdProfile(from: string, to: string): AdProfileStatus {
  if (!isAdProfileStatus(from) || !isAdProfileStatus(to)) {
    throw new DomainError('INVALID_INPUT', 'Status de AdProfile inválido');
  }
  if (!canTransitionAdProfile(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `AdProfile ${from} → ${to} não permitido`);
  }
  return to;
}

export function transitionCampaign(from: string, to: string): CampaignStatus {
  if (!isCampaignStatus(from) || !isCampaignStatus(to)) {
    throw new DomainError('INVALID_INPUT', 'Status de campanha inválido');
  }
  if (!canTransitionCampaign(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Campanha ${from} → ${to} não permitido`);
  }
  return to;
}
