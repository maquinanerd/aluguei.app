import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  ORGANIZATION_STATUSES,
  isOrganizationStatus,
  organizationActionRequiresReason,
  organizationCanOperate,
  organizationStatusAfter,
} from './organization-status.js';

describe('status da imobiliária na plataforma', () => {
  it('aprovar leva pendente ou recusada a ACTIVE', () => {
    expect(organizationStatusAfter('APPROVE', 'PENDING_APPROVAL')).toBe('ACTIVE');
    expect(organizationStatusAfter('APPROVE', 'REJECTED')).toBe('ACTIVE');
  });

  it('recusar só vale para pendente; suspender só para ativa; reativar só para suspensa', () => {
    expect(organizationStatusAfter('REJECT', 'PENDING_APPROVAL')).toBe('REJECTED');
    expect(organizationStatusAfter('SUSPEND', 'ACTIVE')).toBe('SUSPENDED');
    expect(organizationStatusAfter('REACTIVATE', 'SUSPENDED')).toBe('ACTIVE');
  });

  it('transição fora da origem lança INVALID_TRANSITION', () => {
    const invalid: Array<[Parameters<typeof organizationStatusAfter>[0], string]> = [
      ['APPROVE', 'ACTIVE'],
      ['APPROVE', 'SUSPENDED'],
      ['REJECT', 'ACTIVE'],
      ['REJECT', 'REJECTED'],
      ['SUSPEND', 'PENDING_APPROVAL'],
      ['SUSPEND', 'SUSPENDED'],
      ['REACTIVATE', 'ACTIVE'],
      ['REACTIVATE', 'REJECTED'],
    ];
    for (const [action, from] of invalid) {
      let error: unknown;
      try {
        organizationStatusAfter(action, from as (typeof ORGANIZATION_STATUSES)[number]);
      } catch (caught) {
        error = caught;
      }
      expect(error, `${action} a partir de ${from}`).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_TRANSITION');
    }
  });

  it('recusa e suspensão exigem motivo; aprovação e reativação não', () => {
    expect(organizationActionRequiresReason('REJECT')).toBe(true);
    expect(organizationActionRequiresReason('SUSPEND')).toBe(true);
    expect(organizationActionRequiresReason('APPROVE')).toBe(false);
    expect(organizationActionRequiresReason('REACTIVATE')).toBe(false);
  });

  it('só ACTIVE opera o painel, o portal e o site público', () => {
    expect(ORGANIZATION_STATUSES.filter((s) => organizationCanOperate(s))).toEqual(['ACTIVE']);
  });

  it('reconhece os status válidos', () => {
    expect(isOrganizationStatus('PENDING_APPROVAL')).toBe(true);
    expect(isOrganizationStatus('active')).toBe(false);
    expect(isOrganizationStatus('BLOQUEADA')).toBe(false);
  });
});
