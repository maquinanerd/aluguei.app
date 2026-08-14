import type { Permission, Role } from '@aluguei/domain';

/**
 * Espelho de RBAC para navegação/UX (esconder/desabilitar ações).
 * Fonte: packages/domain/src/authz/rbac.ts (ROLE_PERMISSIONS).
 * O SERVIDOR permanece autoridade de autorização; este mapa só governa UI.
 * Mantido como type-only import para não forçar resolução do pacote domain no client.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    'lead:read', 'lead:write', 'party:read', 'party:write', 'task:read', 'task:write',
    'visit:read', 'visit:write', 'proposal:read', 'proposal:write', 'timeline:read', 'timeline:write',
    'property:read', 'property:write', 'listing:read', 'listing:write', 'conversation:read', 'conversation:write',
    'inspection:read', 'inspection:write', 'screening:read', 'screening:write', 'contract:read', 'contract:write',
    'finance:read', 'finance:write', 'meta:read', 'meta:write', 'report:read', 'report:export',
    'portal:manage', 'member:read', 'member:manage', 'org:manage', 'audit:read',
  ],
  admin: [
    'lead:read', 'lead:write', 'party:read', 'party:write', 'task:read', 'task:write',
    'visit:read', 'visit:write', 'proposal:read', 'proposal:write', 'timeline:read', 'timeline:write',
    'property:read', 'property:write', 'listing:read', 'listing:write', 'conversation:read', 'conversation:write',
    'inspection:read', 'inspection:write', 'screening:read', 'screening:write', 'contract:read', 'contract:write',
    'finance:read', 'finance:write', 'meta:read', 'meta:write', 'report:read', 'report:export',
    'portal:manage', 'member:read', 'member:manage', 'org:manage', 'audit:read',
  ],
  agent: [
    'lead:read', 'lead:write', 'party:read', 'party:write', 'task:read', 'task:write',
    'visit:read', 'visit:write', 'proposal:read', 'proposal:write', 'timeline:read', 'timeline:write',
    'property:read', 'property:write', 'listing:read', 'listing:write', 'conversation:read', 'conversation:write',
    'inspection:read', 'inspection:write', 'screening:read', 'screening:write', 'contract:read', 'contract:write',
    'meta:read', 'meta:write', 'portal:manage',
  ],
  inspector: [
    'lead:read', 'party:read', 'task:read', 'task:write', 'visit:read', 'visit:write',
    'timeline:read', 'property:read', 'listing:read', 'conversation:read', 'inspection:read', 'inspection:write',
  ],
  finance: [
    'lead:read', 'party:read', 'task:read', 'visit:read', 'proposal:read', 'timeline:read',
    'property:read', 'screening:read', 'contract:read', 'listing:read', 'conversation:read',
    'inspection:read', 'finance:read', 'finance:write', 'meta:read', 'report:read', 'report:export',
  ],
  viewer: [
    'lead:read', 'party:read', 'task:read', 'visit:read', 'proposal:read', 'timeline:read',
    'property:read', 'listing:read', 'conversation:read',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
