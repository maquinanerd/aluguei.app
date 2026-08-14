export type Role = 'owner' | 'admin' | 'agent' | 'inspector' | 'finance' | 'viewer';

export type Permission =
  | 'lead:read'
  | 'lead:write'
  | 'party:read'
  | 'party:write'
  | 'task:read'
  | 'task:write'
  | 'visit:read'
  | 'visit:write'
  | 'proposal:read'
  | 'proposal:write'
  | 'timeline:read'
  | 'timeline:write'
  | 'property:read'
  | 'property:write'
  | 'listing:read'
  | 'listing:write'
  | 'conversation:read'
  | 'conversation:write'
  | 'member:read'
  | 'member:manage'
  | 'org:manage'
  | 'audit:read';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'lead:read',
  'lead:write',
  'party:read',
  'party:write',
  'task:read',
  'task:write',
  'visit:read',
  'visit:write',
  'proposal:read',
  'proposal:write',
  'timeline:read',
  'timeline:write',
  'property:read',
  'property:write',
  'listing:read',
  'listing:write',
  'conversation:read',
  'conversation:write',
  'member:read',
  'member:manage',
  'org:manage',
  'audit:read',
];

/** Mapa estático role → permissões (RBAC sem tabela de permissions). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  agent: [
    'lead:read',
    'lead:write',
    'party:read',
    'party:write',
    'task:read',
    'task:write',
    'visit:read',
    'visit:write',
    'proposal:read',
    'proposal:write',
    'timeline:read',
    'timeline:write',
    'property:read',
    'property:write',
    'listing:read',
    'listing:write',
    'conversation:read',
    'conversation:write',
  ],
  inspector: [
    'lead:read',
    'party:read',
    'task:read',
    'task:write',
    'visit:read',
    'visit:write',
    'timeline:read',
    'property:read',
    'listing:read',
    'conversation:read',
  ],
  finance: [
    'lead:read',
    'party:read',
    'task:read',
    'visit:read',
    'proposal:read',
    'timeline:read',
    'property:read',
    'listing:read',
    'conversation:read',
  ],
  viewer: [
    'lead:read',
    'party:read',
    'task:read',
    'visit:read',
    'proposal:read',
    'timeline:read',
    'property:read',
    'listing:read',
    'conversation:read',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
