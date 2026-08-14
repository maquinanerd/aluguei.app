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

export * from './meta/housing.js';
export * from './meta/adMaterial.js';
export * from './meta/budget.js';
export * from './meta/stateMachine.js';
export * from './meta/campaignFlow.js';

export {
  LISTING_STATUSES,
  isListingStatus,
  canTransitionListing,
  transitionListing,
} from './property/listing.js';
export type { ListingStatus } from './property/listing.js';

export {
  CHANNEL_TYPES,
  CHANNEL_PUBLICATION_STATUSES,
  CHANNEL_JOB_TYPES,
  CHANNEL_JOB_STATUSES,
  isChannelType,
  isChannelPublicationStatus,
  isChannelJobType,
  isChannelJobStatus,
  canTransitionChannelPublication,
  transitionChannelPublication,
} from './channel/publication.js';
export type {
  ChannelType,
  ChannelPublicationStatus,
  ChannelJobType,
  ChannelJobStatus,
} from './channel/publication.js';

export {
  CONVERSATION_STATUSES,
  isConversationStatus,
  canTransitionConversation,
  transitionConversation,
} from './whatsapp/conversation.js';
export type { ConversationStatus } from './whatsapp/conversation.js';

export { extractIntentByRule } from './whatsapp/intents.js';
export type { IntentKind, IntentExtraction } from './whatsapp/intents.js';

export {
  PROPERTY_CODE_RE,
  parsePropertyCode,
  codePrefixFor,
  formatCode,
} from './whatsapp/propertyCode.js';

export { advanceLeadTo } from './crm/funnel.js';

export {
  INSPECTION_STATUSES,
  isInspectionStatus,
  canTransitionInspection,
  inspectionCompletionIssues,
  transitionInspection,
} from './inspection/stateMachine.js';
export type { InspectionStatus, InspectionTransitionContext } from './inspection/stateMachine.js';

export { computeInspectionDifferences } from './inspection/compare.js';

export {
  RENTAL_APPLICATION_STATUSES,
  isRentalApplicationStatus,
  canTransitionRentalApplication,
  applicationTransitionIssues,
  transitionRentalApplication,
} from './rental/application.js';
export type {
  RentalApplicationStatus,
  ApplicationTransitionContext,
} from './rental/application.js';

export { decideApplication } from './rental/screening.js';
export type {
  ScreeningDecision,
  ScreeningDecisionInput,
  ScreeningDecisionResult,
  RedFlag,
  RuleTrace,
} from './rental/screening.js';

export {
  CONTRACT_STATUSES,
  isContractStatus,
  canTransitionContract,
  transitionContract,
  sha256Hex,
} from './contract/contract.js';
export type { ContractStatus, ContractTransitionContext } from './contract/contract.js';

export { renderTemplate } from './contract/template.js';

export { add, sub, negate, mulBpsFloor, splitAmount } from './finance/money.js';
export { calculateChargeBreakdown } from './finance/chargeCalc.js';
export type { ChargeBreakdown, ChargeCalcInput } from './finance/chargeCalc.js';
export { splitPayment, splitAmong } from './finance/split.js';
export type { SplitAllocation, SplitInput } from './finance/split.js';
export {
  CHARGE_STATUSES,
  LEASE_STATUSES,
  PAYMENT_STATUSES,
  isChargeStatus,
  isLeaseStatus,
  isPaymentStatus,
  canTransitionCharge,
  canTransitionLease,
  canTransitionPayment,
  transitionCharge,
  transitionLease,
  transitionPayment,
} from './finance/stateMachines.js';
export type { ChargeStatus, LeaseStatus, PaymentStatus } from './finance/stateMachines.js';
export type {
  ComparisonKind,
  DifferenceItem,
  ComparableObservation,
} from './inspection/compare.js';
