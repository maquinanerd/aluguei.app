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

/**
 * Demanda por bairro (Onda 4): quantos alertas de imóvel estão ativos no portal
 * nos bairros onde a imobiliária tem anúncio publicado.
 *
 * É o único dado que atravessa a fronteira portal → painel, então a forma do
 * contrato é a garantia: **só contagem**. Não existe campo para contato, nome,
 * e-mail nem telefone de quem criou o alerta, e nenhum identificador de alerta
 * individual — nem por engano numa versão futura.
 */
export const demandByNeighborhoodQuerySchema = z.object({
  /** Cidade da carteira; ausente, a de maior estoque publicado. */
  city: z.string().trim().max(90).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  /**
   * `type` separa também pelo tipo de imóvel e pelos quartos que o alerta pediu, como o cartão
   * "Demanda por bairro" da Visão Geral (ADR-105, B14); o padrão separa só pela finalidade.
   */
  groupBy: z.enum(['purpose', 'type']).default('purpose'),
});

export const demandByNeighborhoodResponseSchema = z.object({
  /** Cidade considerada; nula quando a imobiliária não tem anúncio publicado. */
  city: z.string().nullable(),
  cityLabel: z.string().nullable(),
  /** Alertas ativos na cidade inteira. */
  totalActiveAlerts: z.number().int().nonnegative(),
  rows: z.array(
    z.object({
      neighborhoodSlug: z.string(),
      neighborhood: z.string(),
      purpose: z.enum(['RENT', 'SALE']),
      /** Tipo e quartos pedidos no alerta; só com `groupBy=type`, nulos se o alerta não escolheu. */
      propertyType: z.string().nullable(),
      bedrooms: z.number().int().positive().nullable(),
      count: z.number().int().nonnegative(),
      /** Anúncios publicados da imobiliária no mesmo recorte. */
      published: z.number().int().nonnegative(),
    }),
  ),
});

export type DemandByNeighborhoodResponse = z.infer<typeof demandByNeighborhoodResponseSchema>;
