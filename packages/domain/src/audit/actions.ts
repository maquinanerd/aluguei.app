/** Ações de auditoria padronizadas. */
export const AUDIT_ACTIONS = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_SWITCH_ORG: 'auth.switch_org',
  ORG_CREATED: 'org.created',
  MEMBER_CREATED: 'member.created',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_REMOVED: 'member.removed',
  LEAD_CREATED: 'lead.created',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  PARTY_CREATED: 'party.created',
  PARTY_DEDUPE: 'party.dedupe',
  TASK_CREATED: 'task.created',
  TASK_STATUS_CHANGED: 'task.status_changed',
  VISIT_CREATED: 'visit.created',
  PROPOSAL_CREATED: 'proposal.created',
  TIMELINE_CREATED: 'timeline.created',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
