import { z } from 'zod';
import { uuidSchema } from './common.js';

export const timelineEntityTypeSchema = z.enum(['LEAD', 'PARTY', 'PROPOSAL', 'VISIT', 'TASK']);

export const timelineEventSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  entityType: timelineEntityTypeSchema,
  entityId: z.string(),
  eventType: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  actorUserId: uuidSchema.nullable(),
  occurredAt: z.string(),
});

export const createTimelineEventRequestSchema = z.object({
  entityType: timelineEntityTypeSchema,
  entityId: z.string().min(1),
  eventType: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const createTimelineEventResponseSchema = z.object({ event: timelineEventSchema });

export const listTimelineQuerySchema = z.object({
  entityType: timelineEntityTypeSchema,
  entityId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listTimelineResponseSchema = z.object({
  events: z.array(timelineEventSchema),
});
