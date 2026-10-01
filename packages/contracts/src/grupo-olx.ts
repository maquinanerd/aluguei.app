import { z } from 'zod';
import { channelPublicationStatusSchema, integrationStageSchema } from './channels.js';
import { uuidSchema } from './common.js';
import {
  grupoOlxDestinationSchema,
  grupoOlxDisplayAddressSchema,
  grupoOlxPropertyTypeSchema,
  grupoOlxPublicationTierSchema,
} from './grupo-olx-vocabulario.js';

export {
  grupoOlxDestinationSchema,
  grupoOlxDisplayAddressSchema,
  grupoOlxPropertyTypeSchema,
  grupoOlxPublicationTierSchema,
};

/**
 * Grupo OLX / Canal Pro (ADR-107). ZAP Imóveis, Viva Real e OLX leem o **mesmo** feed VRSync; o
 * plano da imobiliária no Grupo OLX decide em quais deles o anúncio aparece. Os vocabulários do
 * VRSync ficam em `grupo-olx-vocabulario.ts`.
 */

/** Resultado de uma busca do feed (registro de observabilidade). */
export const channelFeedFetchOutcomeSchema = z.enum(['OK', 'ERROR']);

export const grupoOlxListingIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  /** Bloqueia a entrada no feed; aviso não bloqueia. */
  blocking: z.boolean(),
});

export const grupoOlxConnectionSchema = z.object({
  id: uuidSchema,
  enabled: z.boolean(),
  destinations: z.array(grupoOlxDestinationSchema),
  externalAccountId: z.string().nullable(),
  externalCustomerId: z.string().nullable(),
  displayAddress: grupoOlxDisplayAddressSchema,
  listingQuota: z.number().int().nonnegative().nullable(),
  featuredQuota: z.number().int().nonnegative().nullable(),
  superFeaturedQuota: z.number().int().nonnegative().nullable(),
  /** O token não volta: só os últimos caracteres, para conferir com o que está no Canal Pro. */
  feedToken: z.object({ hint: z.string(), createdAt: z.string() }).nullable(),
  lastFeedFetchAt: z.string().nullable(),
  lastCrawlerFetchAt: z.string().nullable(),
  lastCrawlerListingCount: z.number().int().nonnegative().nullable(),
  lastReportAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastErrorAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const quotaSchema = z.number().int().min(0).max(1_000_000).nullable();
const externalIdSchema = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .transform((value) => (value === '' ? null : value));

export const updateGrupoOlxConnectionRequestSchema = z.object({
  enabled: z.boolean(),
  destinations: z
    .array(grupoOlxDestinationSchema)
    .max(3)
    .refine((list) => new Set(list).size === list.length, 'Destino repetido'),
  externalAccountId: externalIdSchema,
  externalCustomerId: externalIdSchema,
  listingQuota: quotaSchema,
  featuredQuota: quotaSchema,
  superFeaturedQuota: quotaSchema,
});

export const grupoOlxImportReportSchema = z.object({
  id: uuidSchema,
  externalReportId: z.string(),
  company: z.string().nullable(),
  reportDate: z.string().nullable(),
  receivedAt: z.string(),
  contracted: z.number().int().nullable(),
  created: z.number().int().nullable(),
  updated: z.number().int().nullable(),
  deleted: z.number().int().nullable(),
  unchanged: z.number().int().nullable(),
  errors: z.number().int().nullable(),
  warnings: z.number().int().nullable(),
  link: z.string().nullable(),
});

const countSchema = z.number().int().nonnegative();

export const grupoOlxOverviewResponseSchema = z.object({
  /** Estágio da integração no produto (ADR-097): nunca "conectado" sem conta real. */
  stage: integrationStageSchema,
  connection: grupoOlxConnectionSchema.nullable(),
  publicContactEmail: z.string().nullable(),
  installation: z.object({
    /** A API sabe o próprio endereço público (`API_BASE_URL`), sem o qual o feed não sai. */
    feedAvailable: z.boolean(),
    /** A chave que o Grupo OLX entrega na homologação está configurada. */
    leadsWebhookConfigured: z.boolean(),
  }),
  counts: z.object({
    total: countSchema,
    pending: countSchema,
    eligible: countSchema,
    awaitingImport: countSchema,
    imported: countSchema,
    importedWithWarnings: countSchema,
    importErrors: countSchema,
    blocked: countSchema,
    removing: countSchema,
    premium: countSchema,
    superPremium: countSchema,
  }),
  leads: z.object({
    received: countSchema,
    duplicates: countSchema,
    lastReceivedAt: z.string().nullable(),
  }),
  lastReport: grupoOlxImportReportSchema.nullable(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
});

export const grupoOlxFeedTokenResponseSchema = z.object({
  /** Mostrada uma vez: o banco guarda só o hash. */
  feedUrl: z.string(),
  hint: z.string(),
  createdAt: z.string(),
});

export const grupoOlxListingRowSchema = z.object({
  listingId: uuidSchema,
  title: z.string(),
  status: channelPublicationStatusSchema,
  publicationTier: grupoOlxPublicationTierSchema,
  portalPropertyType: grupoOlxPropertyTypeSchema.nullable(),
  issues: z.array(grupoOlxListingIssueSchema),
  lastInFeedAt: z.string().nullable(),
  lastReportAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const grupoOlxListingsResponseSchema = z.object({
  items: z.array(grupoOlxListingRowSchema),
  total: countSchema,
});

/** Ajustes da distribuição de um anúncio no Grupo OLX (destaque e tipo no portal). */
export const grupoOlxListingSettingsRequestSchema = z.object({
  publicationTier: grupoOlxPublicationTierSchema.optional(),
  portalPropertyType: grupoOlxPropertyTypeSchema.nullable().optional(),
});

export const grupoOlxPropertyTypeOptionsResponseSchema = z.object({
  /** Tipo do VRSync usado sem escolha da imobiliária; nulo quando o tipo do imóvel é ambíguo. */
  defaultType: grupoOlxPropertyTypeSchema.nullable(),
  options: z.array(grupoOlxPropertyTypeSchema),
});

export type GrupoOlxDestination = z.infer<typeof grupoOlxDestinationSchema>;
export type GrupoOlxPublicationTier = z.infer<typeof grupoOlxPublicationTierSchema>;
export type GrupoOlxPropertyType = z.infer<typeof grupoOlxPropertyTypeSchema>;
export type GrupoOlxDisplayAddress = z.infer<typeof grupoOlxDisplayAddressSchema>;
export type GrupoOlxListingIssue = z.infer<typeof grupoOlxListingIssueSchema>;
export type GrupoOlxConnection = z.infer<typeof grupoOlxConnectionSchema>;
export type GrupoOlxOverviewResponse = z.infer<typeof grupoOlxOverviewResponseSchema>;
export type GrupoOlxListingRow = z.infer<typeof grupoOlxListingRowSchema>;
