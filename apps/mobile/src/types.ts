/**
 * Tipos de resposta da API do Aluguei (espelham os schemas de
 * packages/contracts). O contrato de verdade é a API; o app é cliente fino.
 */

export type InspectionStatus =
  'DRAFT' | 'CAPTURING' | 'PROCESSING' | 'REVIEW' | 'COMPLETED' | 'SIGNED';

export type InspectionType = 'CHECKIN' | 'CHECKOUT' | 'INTERMEDIATE';

export type ObservationCategory =
  'DAMAGE' | 'CONDITION' | 'CLEANLINESS' | 'FURNITURE' | 'INSTALLATION' | 'OTHER';

export type Severity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export type VisitStatus = 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Membership {
  id: string;
  orgId: string;
  role: string;
  createdAt: string;
}

export interface LoginResponse {
  user: User;
  org: Organization;
  membership: Membership;
}

export interface MeResponse {
  user: User;
  activeOrg: Organization | null;
  memberships: Membership[];
}

export interface Visit {
  id: string;
  orgId: string;
  leadId: string | null;
  partyId: string | null;
  propertyId: string | null;
  scheduledAt: string;
  status: VisitStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  propertyType: 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'LAND';
  totalAreaSqm: number | null;
  builtAreaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
  createdAt: string;
  updatedAt: string;
  addresses: PropertyAddress[];
  financialTerms: PropertyFinancialTerms | null;
  owners: PropertyOwner[];
  features: string[];
  media: PropertyMedia[];
}

export interface PropertyAddress {
  id: string;
  label: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  isPublic: boolean;
}

export interface PropertyFinancialTerms {
  monthlyRentCents: number;
  condoFeeCents: number | null;
  iptuCents: number | null;
  securityDepositCents: number | null;
  minimumLeaseMonths: number | null;
  availableFrom: string | null;
}

export interface PropertyOwner {
  partyId: string;
  name: string;
  ownershipSharePct: number | null;
}

export interface PropertyMedia {
  id: string;
  kind: 'PHOTO' | 'DOCUMENT' | 'FLOORPLAN';
  mimeType: string | null;
  sizeBytes: number | null;
  isPublic: boolean;
  createdAt: string;
}

export interface InspectionSummary {
  id: string;
  orgId: string;
  propertyId: string;
  type: InspectionType;
  status: InspectionStatus;
  startedBy: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  inspectionId: string;
  name: string;
  orderIndex: number;
}

export interface InspectionMedia {
  id: string;
  inspectionId: string;
  roomId: string | null;
  kind: 'PHOTO' | 'AUDIO' | 'VIDEO';
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  isEvidence: boolean;
  capturedAt: string | null;
}

export interface InspectionTranscript {
  id: string;
  inspectionId: string;
  mediaId: string;
  text: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  aiModel: string | null;
}

export interface Observation {
  id: string;
  inspectionId: string;
  roomId: string | null;
  mediaId: string | null;
  category: ObservationCategory;
  severity: Severity;
  description: string;
  source: 'HUMAN' | 'AI';
  status: 'DRAFT' | 'CONFIRMED' | 'REJECTED' | 'EDITED';
  aiSuggestionId: string | null;
  createdAt: string;
}

export interface AiSuggestion {
  id: string;
  inspectionId: string;
  mediaId: string | null;
  transcriptId: string | null;
  kind: 'VISUAL' | 'TRANSCRIPT';
  payload: Record<string, unknown>;
  confidence: number | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EDITED';
  createdAt: string;
}

export interface InspectionAggregate {
  inspection: InspectionSummary;
  rooms: Room[];
  media: InspectionMedia[];
  transcripts: InspectionTranscript[];
  observations: Observation[];
  aiSuggestions: AiSuggestion[];
}

export interface ReviewData {
  observations: Observation[];
  aiSuggestions: AiSuggestion[];
}
