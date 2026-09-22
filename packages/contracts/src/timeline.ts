import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Entidades que a timeline registra — o vocabulário fechado de `timeline_events.entity_type`
 * (CHECK `timeline_events_entity_type_valid`). Além das entidades do CRM, a API grava
 * CONVERSATION (devolução da conversa ao atendimento automático e eventos do WhatsApp), LISTING
 * (troca de status do anúncio) e o worker grava RENTAL_APPLICATION (decisão do screening).
 */
export const timelineEntityTypeSchema = z.enum([
  'LEAD',
  'PARTY',
  'PROPOSAL',
  'VISIT',
  'TASK',
  'CONVERSATION',
  'LISTING',
  'RENTAL_APPLICATION',
]);
export type TimelineEntityType = z.infer<typeof timelineEntityTypeSchema>;

/**
 * Entidades em que a equipe cria evento pela API (`POST /timeline`): só as do CRM. Os eventos de
 * conversa, anúncio e candidatura vêm das próprias transições, nunca de lançamento manual.
 */
export const timelineManualEntityTypeSchema = timelineEntityTypeSchema.extract([
  'LEAD',
  'PARTY',
  'PROPOSAL',
  'VISIT',
  'TASK',
]);
export type TimelineManualEntityType = z.infer<typeof timelineManualEntityTypeSchema>;

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
  entityType: timelineManualEntityTypeSchema,
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
