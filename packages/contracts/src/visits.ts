import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const visitStatusSchema = z.enum(['SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW']);

export const visitSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  leadId: uuidSchema.nullable(),
  partyId: uuidSchema.nullable(),
  propertyId: uuidSchema.nullable(),
  scheduledAt: z.string(),
  status: visitStatusSchema,
  note: z.string().nullable(),
  cancelReason: z.string().nullable(),
  statusChangedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createVisitRequestSchema = z.object({
  leadId: uuidSchema.optional(),
  partyId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  scheduledAt: z.string(),
  status: visitStatusSchema.optional(),
  note: z.string().optional(),
});

export const createVisitResponseSchema = z.object({ visit: visitSchema });

export const listVisitsQuerySchema = paginationQuerySchema.extend({
  status: visitStatusSchema.optional(),
});

export const listVisitsResponseSchema = z.object({
  visits: z.array(visitSchema),
  total: z.number().int().nonnegative(),
});

export const getVisitResponseSchema = z.object({ visit: visitSchema });

/**
 * Ciclo de vida da visita (auditoria 2026-09-10, P2-02). `CANCELLED` exige motivo — a regra é do
 * domínio (`transitionVisit`), e o schema só recebe o campo.
 */
export const updateVisitStatusRequestSchema = z
  .object({
    status: visitStatusSchema,
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();

export const updateVisitStatusResponseSchema = z.object({ visit: visitSchema });

/** Reagendar: nova data e hora (instante). A visita volta para agendada. */
export const rescheduleVisitRequestSchema = z
  .object({
    scheduledAt: z.string().min(1),
    note: z.string().max(500).optional(),
  })
  .strict();

export const rescheduleVisitResponseSchema = z.object({ visit: visitSchema });
