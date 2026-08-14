import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const inspectionTypeSchema = z.enum(['CHECKIN', 'CHECKOUT', 'INTERMEDIATE']);
export const inspectionStatusSchema = z.enum([
  'DRAFT',
  'CAPTURING',
  'PROCESSING',
  'REVIEW',
  'COMPLETED',
  'SIGNED',
]);
export const inspectionMediaKindSchema = z.enum(['PHOTO', 'AUDIO', 'VIDEO']);
export const observationCategorySchema = z.enum([
  'DAMAGE',
  'CONDITION',
  'CLEANLINESS',
  'FURNITURE',
  'INSTALLATION',
  'OTHER',
]);
export const severitySchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']);
export const suggestionActionSchema = z.enum(['ACCEPT', 'REJECT', 'EDIT']);
export const suggestionKindSchema = z.enum(['VISUAL', 'TRANSCRIPT']);

export const INSPECTION_MEDIA_SIZE_LIMITS: Record<
  z.infer<typeof inspectionMediaKindSchema>,
  number
> = {
  PHOTO: 15 * 1024 * 1024,
  AUDIO: 50 * 1024 * 1024,
  VIDEO: 300 * 1024 * 1024,
};

export const INSPECTION_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'video/mp4',
] as const;

export const inspectionMimeTypeSchema = z.enum(INSPECTION_MIME_TYPES);

export const inspectionSummarySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  propertyId: uuidSchema,
  type: inspectionTypeSchema,
  status: inspectionStatusSchema,
  startedBy: uuidSchema.nullable(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const inspectionRoomSchema = z.object({
  id: uuidSchema,
  inspectionId: uuidSchema,
  name: z.string(),
  orderIndex: z.number().int(),
});

export const inspectionMediaSchema = z.object({
  id: uuidSchema,
  inspectionId: uuidSchema,
  roomId: uuidSchema.nullable(),
  kind: inspectionMediaKindSchema,
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  isEvidence: z.boolean(),
  capturedAt: z.string().nullable(),
});

export const inspectionTranscriptSchema = z.object({
  id: uuidSchema,
  inspectionId: uuidSchema,
  mediaId: uuidSchema,
  text: z.string(),
  status: z.enum(['PENDING', 'PROCESSED', 'FAILED']),
  aiModel: z.string().nullable(),
});

export const inspectionObservationSchema = z.object({
  id: uuidSchema,
  inspectionId: uuidSchema,
  roomId: uuidSchema.nullable(),
  mediaId: uuidSchema.nullable(),
  category: observationCategorySchema,
  severity: severitySchema,
  description: z.string(),
  source: z.enum(['HUMAN', 'AI']),
  status: z.enum(['DRAFT', 'CONFIRMED', 'REJECTED', 'EDITED']),
  aiSuggestionId: uuidSchema.nullable(),
  createdAt: z.string(),
});

export const inspectionAiSuggestionSchema = z.object({
  id: uuidSchema,
  inspectionId: uuidSchema,
  mediaId: uuidSchema.nullable(),
  transcriptId: uuidSchema.nullable(),
  kind: suggestionKindSchema,
  payload: z.record(z.string(), z.unknown()),
  confidence: z.number().nullable(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EDITED']),
  createdAt: z.string(),
});

export const inspectionComparisonSchema = z.object({
  id: uuidSchema,
  checkinInspectionId: uuidSchema,
  checkoutInspectionId: uuidSchema,
  status: z.enum(['DRAFT', 'COMPLETED']),
  differences: z.unknown(),
  createdAt: z.string(),
});

export const inspectionAggregateSchema = z.object({
  inspection: inspectionSummarySchema,
  rooms: z.array(inspectionRoomSchema),
  media: z.array(inspectionMediaSchema),
  transcripts: z.array(inspectionTranscriptSchema),
  observations: z.array(inspectionObservationSchema),
  aiSuggestions: z.array(inspectionAiSuggestionSchema),
});

export const inspectionReportSchema = z.object({
  inspection: inspectionSummarySchema,
  rooms: z.array(inspectionRoomSchema),
  observations: z.array(inspectionObservationSchema),
  aiSuggestions: z.array(inspectionAiSuggestionSchema),
  transcripts: z.array(inspectionTranscriptSchema),
  mediaCounts: z.record(z.string(), z.number().int()),
});

export const createInspectionRequestSchema = z.object({
  propertyId: uuidSchema,
  type: inspectionTypeSchema,
  scheduledAt: z.string().optional(),
  notes: z.string().optional(),
});

export const createInspectionResponseSchema = z.object({ inspection: inspectionSummarySchema });

export const listInspectionsQuerySchema = paginationQuerySchema.extend({
  status: inspectionStatusSchema.optional(),
  type: inspectionTypeSchema.optional(),
  propertyId: uuidSchema.optional(),
});

export const listInspectionsResponseSchema = z.object({
  inspections: z.array(inspectionSummarySchema),
  total: z.number().int().nonnegative(),
});

export const createRoomRequestSchema = z.object({ name: z.string().min(1).max(100) });

export const createRoomResponseSchema = z.object({ room: inspectionRoomSchema });

export const inspectionMediaUploadUrlRequestSchema = z.object({
  kind: inspectionMediaKindSchema,
  mimeType: inspectionMimeTypeSchema,
  sizeBytes: z.number().int().positive(),
  roomId: uuidSchema.optional(),
});

export const inspectionUploadUrlResponseSchema = z.object({
  url: z.string(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
});

export const confirmInspectionMediaRequestSchema = z.object({ key: z.string().min(1) });

export const confirmInspectionMediaResponseSchema = z.object({ media: inspectionMediaSchema });

export const createObservationRequestSchema = z.object({
  roomId: uuidSchema.optional(),
  mediaId: uuidSchema.optional(),
  category: observationCategorySchema,
  severity: severitySchema,
  description: z.string().min(1).max(2000),
});

export const createObservationResponseSchema = z.object({
  observation: inspectionObservationSchema,
});

export const resolveSuggestionRequestSchema = z.object({
  action: suggestionActionSchema,
  description: z.string().optional(),
});

export const resolveSuggestionResponseSchema = z.object({
  suggestion: inspectionAiSuggestionSchema,
  observation: inspectionObservationSchema.nullable(),
});

export const updateInspectionStatusRequestSchema = z.object({ status: inspectionStatusSchema });

export const updateInspectionStatusResponseSchema = z.object({
  inspection: inspectionSummarySchema,
});

export const createComparisonRequestSchema = z.object({ checkoutInspectionId: uuidSchema });

export const createComparisonResponseSchema = z.object({ comparison: inspectionComparisonSchema });

export const listReviewResponseSchema = z.object({
  observations: z.array(inspectionObservationSchema),
  aiSuggestions: z.array(inspectionAiSuggestionSchema),
});
