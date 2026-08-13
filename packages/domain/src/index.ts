export { DomainError, assert } from './errors.js';
export type { DomainErrorCode } from './errors.js';

export {
  normalizeEmail,
  normalizePhone,
  normalizeDocument,
  slugify,
} from './values/identifiers.js';

export {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
} from './auth/password.js';

export { ALL_PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from './authz/rbac.js';
export type { Role, Permission } from './authz/rbac.js';

export { FUNNEL_STATUSES, isFunnelStatus, canTransition, transitionLead } from './crm/funnel.js';
export type { FunnelStatus, FunnelTransitionContext } from './crm/funnel.js';

export { findDedupeMatches } from './crm/dedupe.js';
export type { IdentityKind, DedupeMatch } from './crm/dedupe.js';

export { AUDIT_ACTIONS } from './audit/actions.js';
export type { AuditAction } from './audit/actions.js';

export {
  LISTING_STATUSES,
  isListingStatus,
  canTransitionListing,
  transitionListing,
} from './property/listing.js';
export type { ListingStatus } from './property/listing.js';
