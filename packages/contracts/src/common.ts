import { z } from 'zod';

export const uuidSchema = z.uuid();

export const roleSchema = z.enum(['owner', 'admin', 'agent', 'inspector', 'finance', 'viewer']);

export const funnelStatusSchema = z.enum([
  'NEW',
  'QUALIFYING',
  'QUALIFIED',
  'VISIT',
  'PROPOSAL',
  'APPLICATION',
  'WON',
  'LOST',
]);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
