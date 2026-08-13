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

export type ServiceInfo = z.infer<typeof serviceInfoSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
