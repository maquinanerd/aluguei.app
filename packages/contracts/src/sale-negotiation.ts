import { z } from 'zod';
import { saleAmountCentsSchema, uuidSchema } from './common.js';

/**
 * Negociação de venda (Onda 5).
 *
 * O histórico é parte do recurso, não um detalhe: a tela precisa da conversa
 * inteira (pedido, proposta, contraproposta, resposta) para a pessoa negociar.
 * Por isso o detalhe vem com eventos, documentos e comissão juntos — três
 * chamadas para montar uma gaveta é como se perde o estado no meio.
 */

export const saleNegotiationStageSchema = z.enum([
  'PROPOSAL',
  'COUNTER',
  'DOCUMENTATION',
  'CONTRACT',
  'CLOSED',
  'LOST',
]);
export const saleEventKindSchema = z.enum(['ASKING', 'BUYER_OFFER', 'SELLER_COUNTER']);
export const saleEventOutcomeSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']);
export const saleDocumentSideSchema = z.enum(['PROPERTY', 'BUYER', 'SELLER']);
export const saleCommissionRoleSchema = z.enum(['CAPTADOR', 'VENDEDOR']);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');

export const saleNegotiationEventSchema = z.object({
  id: uuidSchema,
  kind: saleEventKindSchema,
  amountCents: z.number().int().nonnegative(),
  validUntil: isoDateSchema.nullable(),
  outcome: saleEventOutcomeSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const saleNegotiationDocumentSchema = z.object({
  id: uuidSchema,
  side: saleDocumentSideSchema,
  label: z.string(),
  provided: z.boolean(),
  providedAt: z.string().nullable(),
});

export const saleCommissionShareSchema = z.object({
  role: saleCommissionRoleSchema,
  userId: uuidSchema.nullable(),
  percentBps: z.number().int().min(0).max(10_000),
  /** Quanto cabe a este participante do valor em jogo hoje. */
  amountCents: z.number().int().nonnegative(),
});

export const saleNegotiationSchema = z.object({
  id: uuidSchema,
  propertyId: uuidSchema,
  buyerPartyId: uuidSchema,
  stage: saleNegotiationStageSchema,
  askingPriceCents: z.number().int().nonnegative().nullable(),
  currentAmountCents: z.number().int().nonnegative().nullable(),
  commissionBps: z.number().int().nonnegative(),
  /** Comissão sobre o valor em jogo; nula quando ainda não há valor. */
  commissionCents: z.number().int().nonnegative().nullable(),
  ownerUserId: uuidSchema.nullable(),
  closedAt: z.string().nullable(),
  closedAmountCents: z.number().int().nonnegative().nullable(),
  lostReason: z.string().nullable(),
  documents: z.object({
    provided: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const saleNegotiationDetailSchema = saleNegotiationSchema.extend({
  events: z.array(saleNegotiationEventSchema),
  documentList: z.array(saleNegotiationDocumentSchema),
  commissionShares: z.array(saleCommissionShareSchema),
});

export const createSaleNegotiationRequestSchema = z.object({
  propertyId: uuidSchema,
  buyerPartyId: uuidSchema,
  /** Pedido do proprietário quando a negociação começa. */
  askingPriceCents: saleAmountCentsSchema.optional(),
  /** Primeira proposta do comprador, quando já existe. */
  offerAmountCents: saleAmountCentsSchema.optional(),
  validUntil: isoDateSchema.optional(),
  commissionBps: z.number().int().min(0).max(3_000).optional(),
});

export const addSaleNegotiationEventRequestSchema = z.object({
  kind: saleEventKindSchema,
  amountCents: saleAmountCentsSchema,
  validUntil: isoDateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const answerSaleNegotiationEventRequestSchema = z.object({
  outcome: z.enum(['ACCEPTED', 'REJECTED', 'EXPIRED']),
  note: z.string().trim().max(500).optional(),
});

export const moveSaleNegotiationRequestSchema = z.object({
  stage: saleNegotiationStageSchema,
  /** Obrigatório ao perder: a imobiliária precisa saber por quê. */
  reason: z.string().trim().max(200).optional(),
  /** Obrigatório ao fechar: o valor que fechou. */
  closedAmountCents: saleAmountCentsSchema.optional(),
});

export const upsertSaleDocumentRequestSchema = z.object({
  side: saleDocumentSideSchema,
  label: z.string().trim().min(1).max(120),
  provided: z.boolean(),
});

export const setSaleCommissionRequestSchema = z.object({
  commissionBps: z.number().int().min(0).max(3_000),
  shares: z
    .array(
      z.object({
        role: saleCommissionRoleSchema,
        userId: uuidSchema.optional(),
        percentBps: z.number().int().min(0).max(10_000),
      }),
    )
    .max(2),
});

export const listSaleNegotiationsQuerySchema = z.object({
  stage: saleNegotiationStageSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listSaleNegotiationsResponseSchema = z.object({
  negotiations: z.array(saleNegotiationSchema),
  total: z.number().int().nonnegative(),
  /** Quantas em cada etapa, para as colunas do quadro. */
  byStage: z.record(saleNegotiationStageSchema, z.number().int().nonnegative()),
});

export const saleNegotiationResponseSchema = z.object({
  negotiation: saleNegotiationDetailSchema,
});

/** Painel de vendas do mês: o que fechou e o que está em jogo. */
export const salesSummaryQuerySchema = z.object({
  /** Mês no formato `2026-09`; ausente, o mês corrente. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Mês no formato AAAA-MM')
    .optional(),
});

export const salesSummaryResponseSchema = z.object({
  month: z.string(),
  closed: z.object({
    count: z.number().int().nonnegative(),
    /** Valor geral de venda do mês. */
    volumeCents: z.number().int().nonnegative(),
    commissionCents: z.number().int().nonnegative(),
  }),
  open: z.object({
    count: z.number().int().nonnegative(),
    volumeCents: z.number().int().nonnegative(),
  }),
  lost: z.object({ count: z.number().int().nonnegative() }),
});

export type SaleNegotiationDetail = z.infer<typeof saleNegotiationDetailSchema>;
export type SalesSummaryResponse = z.infer<typeof salesSummaryResponseSchema>;
