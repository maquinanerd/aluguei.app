import { z } from 'zod';
import { uuidSchema } from './common.js';

export const funnelReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  periodDays: z.coerce.number().int().min(1).max(30).default(1),
});

export const funnelReportResponseSchema = z.object({
  points: z.array(
    z.object({
      period: z.string(),
      status: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export const revenueMonthlyQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const revenueMonthlyResponseSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      amountCents: z.number().int(),
    }),
  ),
});

export const metaSpendQuerySchema = z.object({
  campaignId: uuidSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const metaSpendResponseSchema = z.object({
  totalSpendCents: z.number().int().nonnegative(),
  byCampaign: z.array(
    z.object({
      campaignId: uuidSchema,
      spendCents: z.number().int().nonnegative(),
    }),
  ),
});

export const exportKindSchema = z.enum([
  'leads',
  'charges',
  'payments',
  'payouts',
  'inspections',
  'contracts',
  'meta_campaigns',
]);

export const exportQuerySchema = z
  .object({
    kind: exportKindSchema,
    format: z.enum(['csv', 'json']).default('json'),
    from: z.string().optional(),
    to: z.string().optional(),
    // Limite rígido: exportação síncrona nunca passa de 10k linhas (ADR-034).
    maxRows: z.coerce.number().int().min(1).max(10_000).default(1_000),
  })
  .strict();
