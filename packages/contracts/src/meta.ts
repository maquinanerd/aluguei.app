import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const metaConnectionStatusSchema = z.enum(['CONNECTING', 'ACTIVE', 'EXPIRED', 'REVOKED']);
export const metaAssetKindSchema = z.enum(['AD_ACCOUNT', 'PAGE', 'INSTAGRAM_ACCOUNT', 'BUSINESS']);
export const metaAdProfileStatusSchema = z.enum([
  'DRAFT',
  'PREPARED',
  'CREATED',
  'PUBLISHED',
  'PAUSED',
  'ARCHIVED',
]);
export const metaCampaignStatusSchema = z.enum(['CREATED_PAUSED', 'ACTIVE', 'PAUSED', 'ARCHIVED']);
export const metaObjectiveSchema = z.enum([
  'OUTCOME_TRAFFIC',
  'OUTCOME_LEADS',
  'OUTCOME_ENGAGEMENT',
]);
export const metaSpecialAdCategorySchema = z.enum(['HOUSING', 'CREDIT', 'EMPLOYMENT']);
export const metaJobTypeSchema = z.enum([
  'SYNC_INSIGHTS',
  'CREATE_CAMPAIGN',
  'PUBLISH_INTENT',
  'PAUSE',
  'RESUME',
  'UPDATE_BUDGET',
  'UPDATE_SCHEDULE',
  'UPDATE_CREATIVE',
  'ARCHIVE',
]);

export const metaConnectionSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  providerUserId: z.string().nullable(),
  status: metaConnectionStatusSchema,
  scopes: z.array(z.string()),
  expiresAt: z.string().nullable(),
  lastTestedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const metaAssetSchema = z.object({
  id: uuidSchema,
  connectionId: uuidSchema,
  kind: metaAssetKindSchema,
  providerAssetId: z.string(),
  name: z.string(),
  status: z.string(),
  isSelected: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

export const metaAdProfileSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  connectionId: uuidSchema,
  propertyId: uuidSchema,
  listingId: uuidSchema.nullable(),
  name: z.string(),
  objective: metaObjectiveSchema,
  dailyBudgetCents: z.number().int().nonnegative().nullable(),
  lifetimeBudgetCents: z.number().int().nonnegative().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  geos: z.array(z.record(z.string(), z.unknown())),
  mediaSelection: z.array(uuidSchema),
  pageAssetId: uuidSchema.nullable(),
  instagramAssetId: uuidSchema.nullable(),
  landingUrl: z.string(),
  copyPrimary: z.string(),
  copyVariants: z.array(z.string()),
  specialAdCategories: z.array(metaSpecialAdCategorySchema),
  status: metaAdProfileStatusSchema,
  idempotencyKey: z.string().nullable(),
  preparedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const metaCampaignLinkSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  adProfileId: uuidSchema,
  providerCampaignId: z.string(),
  name: z.string(),
  objective: metaObjectiveSchema,
  specialAdCategories: z.array(metaSpecialAdCategorySchema),
  dailyBudgetCents: z.number().int().nonnegative().nullable(),
  lifetimeBudgetCents: z.number().int().nonnegative().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  status: metaCampaignStatusSchema,
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const metaCampaignDetailSchema = metaCampaignLinkSchema.extend({
  adset: z
    .object({
      id: uuidSchema,
      providerAdsetId: z.string(),
      name: z.string(),
      status: z.string(),
      targeting: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  creative: z
    .object({
      id: uuidSchema,
      providerCreativeId: z.string(),
      name: z.string(),
      mediaRefs: z.array(z.string()),
      copyPrimary: z.string(),
      landingUrl: z.string(),
      mediaHash: z.string().nullable(),
      status: z.string(),
    })
    .nullable(),
  ad: z
    .object({
      id: uuidSchema,
      providerAdId: z.string(),
      status: z.string(),
    })
    .nullable(),
});

export const metaPreviewSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  objective: metaObjectiveSchema,
  copyPrimary: z.string(),
  landingUrl: z.string(),
  mediaSelection: z.array(uuidSchema),
  specialAdCategories: z.array(metaSpecialAdCategorySchema),
  dailyBudgetCents: z.number().int().nonnegative().nullable(),
  lifetimeBudgetCents: z.number().int().nonnegative().nullable(),
  status: metaCampaignStatusSchema,
});

export const metaInsightsSchema = z.object({
  campaignLinkId: uuidSchema,
  dateStart: z.string(),
  dateEnd: z.string(),
  insights: z.record(z.string(), z.unknown()),
  syncedAt: z.string(),
});

export const metaOrgSettingsSchema = z.object({
  orgId: uuidSchema,
  maxDailyBudgetCents: z.number().int().nonnegative(),
  maxLifetimeBudgetCents: z.number().int().nonnegative(),
  allowedGeos: z.array(z.record(z.string(), z.unknown())),
  housingTargetingAllowed: z.boolean(),
});

// ---- Requests (strict) ----

export const createMetaConnectionRequestSchema = z
  .object({
    // Em dry-run: registrar conexão fake sem código OAuth real.
    provider: z.enum(['FAKE', 'META']),
    code: z.string().optional(),
    redirectUri: z.string().optional(),
  })
  .strict();

export const prepareCampaignRequestSchema = z
  .object({
    connectionId: uuidSchema,
    propertyId: uuidSchema,
    listingId: uuidSchema.optional(),
    name: z.string().min(1).max(120),
    objective: metaObjectiveSchema,
    dailyBudgetCents: z.number().int().nonnegative().optional(),
    lifetimeBudgetCents: z.number().int().nonnegative().optional(),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    geos: z.array(z.record(z.string(), z.unknown())).optional(),
    mediaSelection: z.array(uuidSchema).min(1),
    pageAssetId: uuidSchema.optional(),
    instagramAssetId: uuidSchema.optional(),
    landingUrl: z.url().refine((url) => url.startsWith('https://'), 'Landing page exige HTTPS'),
    copyPrimary: z.string().min(1).max(500),
    copyVariants: z.array(z.string().min(1).max(500)).optional(),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

export const createCampaignRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

export const campaignActionRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

export const updateBudgetRequestSchema = z
  .object({
    dailyBudgetCents: z.number().int().nonnegative().optional(),
    lifetimeBudgetCents: z.number().int().nonnegative().optional(),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasDaily = value.dailyBudgetCents !== undefined;
    const hasLifetime = value.lifetimeBudgetCents !== undefined;
    if (hasDaily === hasLifetime) {
      ctx.addIssue({
        code: 'custom',
        path: ['budget'],
        message: 'Defina exatamente um orçamento: daily OU lifetime',
      });
    }
  });

export const updateScheduleRequestSchema = z
  .object({
    startAt: z.string().optional(),
    endAt: z.string().nullable().optional(),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

export const updateCreativeRequestSchema = z
  .object({
    copyPrimary: z.string().min(1).max(500),
    mediaSelection: z.array(uuidSchema).min(1),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

export const syncInsightsRequestSchema = z
  .object({
    dateStart: z.string().optional(),
    dateEnd: z.string().optional(),
  })
  .strict();

export const listCampaignsQuerySchema = paginationQuerySchema.extend({
  propertyId: uuidSchema.optional(),
  status: metaCampaignStatusSchema.optional(),
});

export const listAdProfilesQuerySchema = paginationQuerySchema.extend({
  status: metaAdProfileStatusSchema.optional(),
  propertyId: uuidSchema.optional(),
});

export const metaWebhookEventSchema = z.object({
  provider: z.enum(['FAKE', 'META']),
  eventType: z.string().min(1),
  providerEventId: z.string().min(1),
  adAccountId: z.string().optional(),
  campaignId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
