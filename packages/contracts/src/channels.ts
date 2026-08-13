import { z } from 'zod';
import { uuidSchema } from './common.js';

export const channelTypeSchema = z.enum([
  'fake',
  'canalpro',
  'vivareal',
  'zap',
  'olx',
  'imovelweb',
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

export const publishRequestSchema = z.object({});
export const updateRequestSchema = z.object({});
export const removeRequestSchema = z.object({});
export const reconcileRequestSchema = z.object({ listingId: uuidSchema.optional() });
export const importLeadsRequestSchema = z.object({});

export const channelPublishResponseSchema = z.object({
  publication: channelPublicationSchema,
  job: channelSyncJobSchema,
});

export const removeResponseSchema = z.object({
  publication: channelPublicationSchema,
  job: channelSyncJobSchema,
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
