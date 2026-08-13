import { describe, expect, it } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS } from './rbac.js';
import type { Role } from './rbac.js';

const ROLES: Role[] = ['owner', 'admin', 'agent', 'inspector', 'finance', 'viewer'];

describe('rbac', () => {
  it('owner e admin têm todas as permissões', () => {
    for (const role of ['owner', 'admin'] as const) {
      for (const permission of ROLE_PERMISSIONS.owner) {
        expect(hasPermission(role, permission), `${role}:${permission}`).toBe(true);
      }
    }
  });

  it('viewer não escreve em lead', () => {
    expect(hasPermission('viewer', 'lead:write')).toBe(false);
    expect(hasPermission('viewer', 'lead:read')).toBe(true);
  });

  it('inspector escreve visit/task mas não lead', () => {
    expect(hasPermission('inspector', 'visit:write')).toBe(true);
    expect(hasPermission('inspector', 'task:write')).toBe(true);
    expect(hasPermission('inspector', 'lead:write')).toBe(false);
  });

  it('agent não gerencia membros', () => {
    expect(hasPermission('agent', 'member:manage')).toBe(false);
  });

  it('todos os roles têm mapa estático', () => {
    for (const role of ROLES) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    }
  });
});
