import { z } from 'zod';
import { uuidSchema } from './common.js';
import {
  grupoOlxPropertyTypeSchema,
  grupoOlxPublicationTierSchema,
} from './grupo-olx-vocabulario.js';

/**
 * Canais de distribuição. `grupoolx` é o feed VRSync do Grupo OLX (ZAP, Viva Real e OLX conforme o
 * plano da imobiliária, ADR-107); `canalpro`, `vivareal` e `zap` ficam só por compatibilidade
 * (substituídos por `grupoolx`), e `olx` fica reservado para a API própria da OLX.
 */
export const channelTypeSchema = z.enum([
  'fake',
  'canalpro',
  'vivareal',
  'zap',
  'olx',
  'imovelweb',
  'grupoolx',
]);

/** PUSH: o sistema chama o portal. FEED: o portal busca um arquivo (ADR-107). */
export const channelModeSchema = z.enum(['PUSH', 'FEED']);

/**
 * Estágio da integração no produto (ADR-097, ADR-107). Sem código: `IN_PREPARATION`. Com código e
 * testes, sem conta real: `IMPLEMENTED_NOT_LIVE_VERIFIED`. `HOMOLOGATION_PENDING` só depois do
 * pedido de homologação enviado; `LIVE_VERIFIED` só depois de um ciclo real com uma imobiliária.
 */
export const integrationStageSchema = z.enum([
  'IN_PREPARATION',
  'IMPLEMENTED_NOT_LIVE_VERIFIED',
  'HOMOLOGATION_PENDING',
  'LIVE_VERIFIED',
  'TEST_ONLY',
]);

export const channelPublicationStatusSchema = z.enum([
  'PENDING',
  'PUBLISHING',
  'PUBLISHED',
  'UPDATE_PENDING',
  'REMOVING',
  'REMOVED',
  'FAILED',
  'RECONCILING',
  // Modo FEED (Grupo OLX, ADR-107): entrar no XML não é estar publicado no portal.
  'BLOCKED',
  'ELIGIBLE',
  'AWAITING_IMPORT',
  'IMPORTED',
  'IMPORTED_WITH_WARNINGS',
  'IMPORT_ERROR',
]);

export const channelJobTypeSchema = z.enum([
  'PUBLISH',
  'UPDATE',
  'REMOVE',
  'RECONCILE',
  'IMPORT_LEADS',
]);

export const channelJobStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED']);

export const channelPublicationSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  listingId: uuidSchema,
  channel: channelTypeSchema,
  channelListingId: z.string().nullable(),
  status: channelPublicationStatusSchema,
  lastError: z.string().nullable(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  /** Destaque contratado no portal (`PublicationType` do VRSync); nulo em canal sem destaque. */
  publicationTier: z.string().nullable(),
  /** Tipo do imóvel no portal, quando o tipo do AchouImóvel não decide sozinho. */
  portalPropertyType: z.string().nullable(),
  /** Motivos de bloqueio e avisos (modo FEED) e críticas do relatório de importação. */
  issues: z.array(z.object({ code: z.string(), message: z.string(), blocking: z.boolean() })),
  /** Última vez que o robô do portal levou este anúncio no feed. */
  lastInFeedAt: z.string().nullable(),
});

export const channelSyncJobSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  listingId: uuidSchema.nullable(),
  channel: channelTypeSchema,
  jobType: channelJobTypeSchema,
  status: channelJobStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  runAt: z.string(),
  createdAt: z.string(),
});

/** Canal FEED do Grupo OLX aceita destaque e tipo no portal; os demais ignoram. */
export const publishRequestSchema = z.object({
  publicationTier: grupoOlxPublicationTierSchema.optional(),
  portalPropertyType: grupoOlxPropertyTypeSchema.nullable().optional(),
});
export const updateRequestSchema = z.object({});
export const removeRequestSchema = z.object({});
export const reconcileRequestSchema = z.object({ listingId: uuidSchema.optional() });
export const importLeadsRequestSchema = z.object({});

/** Canal FEED (Grupo OLX) não tem job: a avaliação é na hora e o portal busca o arquivo. */
export const channelPublishResponseSchema = z.object({
  publication: channelPublicationSchema,
  job: channelSyncJobSchema.nullable(),
});

export const removeResponseSchema = z.object({
  publication: channelPublicationSchema,
  job: channelSyncJobSchema.nullable(),
});

export const reconcileResponseSchema = z.object({
  job: channelSyncJobSchema,
  processed: z.number().int().nonnegative(),
});

export const importLeadsResponseSchema = z.object({
  job: channelSyncJobSchema,
  imported: z.number().int().nonnegative(),
});

export const listChannelsResponseSchema = z.object({
  channels: z.array(channelPublicationSchema.nullable()),
});

export const channelSummarySchema = z.object({
  channels: z.array(
    z.object({
      channel: channelTypeSchema,
      total: z.number().int().nonnegative(),
      published: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
    }),
  ),
  listings: z.array(
    z.object({
      listingId: uuidSchema,
      title: z.string(),
      channels: z.array(
        z.object({
          channel: channelTypeSchema,
          status: channelPublicationStatusSchema,
          lastError: z.string().nullable(),
        }),
      ),
    }),
  ),
});

/** Canais que podem receber publicação agora (adapter configurado) — P1-17. */
export const listAvailableChannelsResponseSchema = z.object({
  channels: z.array(
    z.object({
      channel: channelTypeSchema,
      /** Recebe publicação agora (adapter, ou conexão ativa no modo FEED). */
      available: z.boolean(),
      /** Aparece na tela; canais substituídos e reservados ficam de fora. */
      offered: z.boolean(),
      mode: channelModeSchema.nullable(),
      stage: integrationStageSchema,
    }),
  ),
});
