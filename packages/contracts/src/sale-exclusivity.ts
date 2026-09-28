import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Exclusividade de venda (Onda 5).
 *
 * O período é **dia**, não instante: a autorização do proprietário vale por
 * data, em qualquer fuso. A situação (`state`, `daysLeft`) é calculada pelo
 * servidor e vem pronta — a tela não recalcula prazo, porque duas contas de
 * prazo divergem no dia em que mais importam, o do vencimento.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');

export const exclusivityStateSchema = z.enum([
  'SCHEDULED',
  'ACTIVE',
  'ENDING_SOON',
  'EXPIRED',
  'CANCELED',
]);

export const saleExclusivitySchema = z.object({
  id: uuidSchema,
  propertyId: uuidSchema,
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  /** Autorização assinada, entre as mídias do imóvel. */
  documentMediaId: uuidSchema.nullable(),
  canceledAt: z.string().nullable(),
  canceledReason: z.string().nullable(),
  state: exclusivityStateSchema,
  /** Dias até o fim; negativo depois de vencida. */
  daysLeft: z.number().int(),
  totalDays: z.number().int(),
  createdAt: z.string(),
});

export const createSaleExclusivityRequestSchema = z.object({
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  documentMediaId: uuidSchema.optional(),
});

export const cancelSaleExclusivityRequestSchema = z.object({
  reason: z.string().trim().min(1).max(200),
});

export const saleExclusivityResponseSchema = z.object({ exclusivity: saleExclusivitySchema });
export const listSaleExclusivitiesResponseSchema = z.object({
  exclusivities: z.array(saleExclusivitySchema),
  /** A que vale hoje, se houver — é a que a tela do imóvel mostra. */
  current: saleExclusivitySchema.nullable(),
});

export type SaleExclusivity = z.infer<typeof saleExclusivitySchema>;
