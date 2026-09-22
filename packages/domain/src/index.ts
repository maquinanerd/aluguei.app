export { DomainError, assert } from './errors.js';
export type { DomainErrorCode } from './errors.js';

export {
  normalizeEmail,
  normalizePhone,
  normalizeDocument,
  slugify,
} from './values/identifiers.js';

export {
  assertValidIdentityValue,
  formatDocument,
  isValidCnpj,
  isValidCpf,
} from './values/documents.js';

export {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
} from './auth/password.js';

export {
  assertNewPassword,
  assertTokenUsable,
  expiresAt,
  MEMBER_INVITE_TTL_HOURS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_TTL_MINUTES,
  tokenUsable,
} from './auth/recovery.js';
export type { OneTimeToken } from './auth/recovery.js';

export { ALL_PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from './authz/rbac.js';
export type { Role, Permission } from './authz/rbac.js';

export { FUNNEL_STATUSES, isFunnelStatus, canTransition, transitionLead } from './crm/funnel.js';
export type { FunnelStatus, FunnelTransitionContext } from './crm/funnel.js';

export { findDedupeMatches } from './crm/dedupe.js';
export type { IdentityKind, DedupeMatch } from './crm/dedupe.js';

export {
  canTransitionVisit,
  isVisitStatus,
  transitionVisit,
  VISIT_STATUSES,
  visitReschedulable,
} from './crm/visit.js';
export type { VisitStatus, VisitTransitionContext } from './crm/visit.js';

export {
  canTransitionProposal,
  isProposalExpired,
  isProposalStatus,
  PROPOSAL_STATUSES,
  proposalEditable,
  transitionProposal,
} from './crm/proposal.js';
export type { ProposalStatus, ProposalTransitionContext } from './crm/proposal.js';

export { AUDIT_ACTIONS } from './audit/actions.js';
export type { AuditAction } from './audit/actions.js';

export * from './meta/housing.js';
export * from './meta/adMaterial.js';
export * from './meta/budget.js';
export * from './meta/stateMachine.js';
export * from './meta/campaignFlow.js';
export * from './portal/portal.js';
export * from './platform/organization-status.js';
export * from './platform/plan-limits.js';
export * from './platform/platform-admins.js';

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
  assertInspectionEvidenceWritable,
  canWriteInspectionEvidence,
  INSPECTION_EVIDENCE_WRITABLE_STATUSES,
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
  CREDIT_DECISION_SOURCES,
  isRentalApplicationStatus,
  canTransitionRentalApplication,
  applicationTransitionIssues,
  transitionRentalApplication,
} from './rental/application.js';
export type {
  RentalApplicationStatus,
  ApplicationTransitionContext,
  ApplicationTransitionSource,
  CreditDecisionSource,
} from './rental/application.js';

export { decideApplication, describeScreeningDecision } from './rental/screening.js';
export type {
  ScreeningDecision,
  ScreeningDecisionInput,
  ScreeningDecisionResult,
  RedFlag,
  RuleTrace,
} from './rental/screening.js';

export {
  CONTRACT_STATUSES,
  CONTRACT_CONTENT_WRITABLE_STATUSES,
  isContractStatus,
  canTransitionContract,
  canWriteContractContent,
  assertContractContentWritable,
  transitionContract,
  sha256Hex,
} from './contract/contract.js';
export type { ContractStatus, ContractTransitionContext } from './contract/contract.js';

export { renderTemplate } from './contract/template.js';
export {
  CONTRACT_TEMPLATE_VARIABLES,
  buildContractVariables,
  formatCentsBRL,
} from './contract/variables.js';
export type { ContractTemplateVariable, ContractVariableSource } from './contract/variables.js';

export { add, sub, negate, mulBpsFloor, splitAmount } from './finance/money.js';
export {
  assertLateChargeTerms,
  calculateChargeBreakdown,
  chargeDueDate,
  DEFAULT_INTEREST_MONTHLY_BPS,
  DEFAULT_LATE_FEE_BPS,
  isChargeOverdue,
  MAX_INTEREST_MONTHLY_BPS,
  MAX_LATE_FEE_BPS,
} from './finance/chargeCalc.js';
export type { ChargeBreakdown, ChargeCalcInput, LateChargeTerms } from './finance/chargeCalc.js';
export {
  addDays,
  daysBetween,
  easterSunday,
  isBankHoliday,
  isBusinessDay,
  monthStartOf,
  nextBusinessDay,
  nextMonthStart,
  saoPauloDate,
} from './finance/calendar.js';
export {
  assertOwnershipTotal,
  assertReadjustmentWithinLease,
  assertRenewal,
  assertRentChangeAfterHistory,
  BILLABLE_LEASE_STATUSES,
  landlordSharesFromOwners,
  planLeaseEnd,
  readjustedRent,
  rentForPeriod,
  shouldBillPeriod,
  shouldFinalizeLeaseEnd,
} from './finance/leaseLifecycle.js';
export type {
  LandlordShare,
  LeasePeriodInfo,
  OwnerShareInput,
  RentChange,
} from './finance/leaseLifecycle.js';
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
