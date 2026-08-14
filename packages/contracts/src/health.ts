import { z } from 'zod';

export const serviceInfoSchema = z.object({
  service: z.string(),
  version: z.string(),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  uptimeMs: z.number().nonnegative().optional(),
});

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  service: z.string(),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
  timestamp: z.string(),
});

export type ServiceInfo = z.infer<typeof serviceInfoSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
