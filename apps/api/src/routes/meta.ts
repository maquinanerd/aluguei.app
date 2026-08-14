import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '@aluguei/db';
import {
  listings,
  metaAdLinks,
  metaAdProfiles,
  metaAdsetLinks,
  metaAssets,
  metaCampaignLinks,
  metaConnections,
  metaCreativeLinks,
  metaOrgSettings,
  metaSyncJobs,
  properties,
  propertyMedia,
} from '@aluguei/db';
import { digestInput, encryptSecret } from '@aluguei/config';
import { AUDIT_ACTIONS, DomainError, transitionAdProfile } from '@aluguei/domain';
import {
  createPausedCampaign,
  requiredSpecialAdCategories,
  validateAdMaterial,
  validateBudget,
  validateHousingTargeting,
} from '@aluguei/domain';
import {
  campaignActionRequestSchema,
  createCampaignRequestSchema,
  createMetaConnectionRequestSchema,
  listCampaignsQuerySchema,
  metaAdProfileSchema,
  metaAssetSchema,
  metaCampaignDetailSchema,
  metaCampaignLinkSchema,
  metaConnectionSchema,
  metaPreviewSchema,
  prepareCampaignRequestSchema,
  syncInsightsRequestSchema,
  updateBudgetRequestSchema,
  updateCreativeRequestSchema,
  updateScheduleRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import type { MetaAssetInfo } from '@aluguei/integrations';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type ConnectionRow = typeof metaConnections.$inferSelect;

function toConnectionDto(row: ConnectionRow): unknown {
  return metaConnectionSchema.parse({
    id: row.id,
    orgId: row.orgId,
    providerUserId: row.providerUserId,
    status: row.status,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Upsert de ativos descobertos do provider na conexão. */
async function upsertAssets(
  db: AppDb,
  orgId: string,
  connectionId: string,
  assets: MetaAssetInfo[],
): Promise<void> {
  for (const asset of assets) {
    await db
      .insert(metaAssets)
      .values({
        orgId,
        connectionId,
        kind: asset.kind,
        providerAssetId: asset.providerAssetId,
        name: asset.name,
        status: asset.status,
        metadata: (asset.metadata ?? {}) as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [metaAssets.connectionId, metaAssets.kind, metaAssets.providerAssetId],
        set: { name: asset.name, status: asset.status, updatedAt: new Date() },
      });
  }
}

export const metaRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  // ---- Conexões ----

  app.get('/meta/connections', { onRequest: [requirePermission('meta:read')] }, async (request) => {
    const auth = requireAuth(request);
    const rows = await db
      .select()
      .from(metaConnections)
      .where(eq(metaConnections.orgId, auth.orgId))
      .orderBy(desc(metaConnections.createdAt));
    return { connections: rows.map((row) => toConnectionDto(row)) };
  });

  app.post(
    '/meta/connections',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createMetaConnectionRequestSchema.parse(request.body);
      const meta = app.metaAds;
      if (!meta) {
        throw new DomainError('INVALID_INPUT', 'Meta Ads não configurado');
      }

      // Em dry-run: conexão fake sem OAuth real. Em live: OAuth real exige
      // adapter homologado (IMPLEMENTED_NOT_LIVE_VERIFIED) — rejeita código.
      let accessTokenEncrypted: string | null = null;
      let tokenKeyId: string | null = null;
      const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY;
      if (input.provider === 'META') {
        if (!input.code) {
          throw new DomainError('INVALID_INPUT', 'Conexão META real exige código OAuth homologado');
        }
        if (!encryptionKey) {
          throw new DomainError('INVALID_INPUT', 'META_TOKEN_ENCRYPTION_KEY ausente');
        }
        const encrypted = encryptSecret(`pending:${input.code.slice(0, 8)}`, encryptionKey);
        accessTokenEncrypted = `${encrypted.keyId}:${encrypted.iv}:${encrypted.value}`;
        tokenKeyId = encrypted.keyId;
      } else {
        // FAKE (dry-run): token fake criptografado (ou nulo sem chave).
        if (encryptionKey) {
          const encrypted = encryptSecret('EAAG-fake-dry-run-token', encryptionKey);
          accessTokenEncrypted = `${encrypted.keyId}:${encrypted.iv}:${encrypted.value}`;
          tokenKeyId = encrypted.keyId;
        }
      }

      const test = await meta.testConnection();
      const connection = first(
        await db
          .insert(metaConnections)
          .values({
            orgId: auth.orgId,
            providerUserId: test.providerUserId ?? null,
            status: test.ok ? 'ACTIVE' : 'EXPIRED',
            scopes: (test.scopes ?? []) as string[],
            accessTokenEncrypted,
            tokenKeyId,
            lastTestedAt: new Date(),
          })
          .returning(),
      );
      const assets = await meta.listAssets();
      await upsertAssets(db, auth.orgId, connection.id, assets);

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.META_CONNECTION_CREATED,
        entityType: 'META_CONNECTION',
        entityId: connection.id,
        payload: { provider: input.provider, assets: assets.length },
      });
      return reply.status(201).send({ connection: toConnectionDto(connection) });
    },
  );

  app.get(
    '/meta/connections/:id/assets',
    { onRequest: [requirePermission('meta:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [connection] = await db
        .select()
        .from(metaConnections)
        .where(and(eq(metaConnections.id, id), eq(metaConnections.orgId, auth.orgId)))
        .limit(1);
      if (!connection) {
        throw new DomainError('NOT_FOUND', 'Conexão não encontrada');
      }
      const rows = await db
        .select()
        .from(metaAssets)
        .where(eq(metaAssets.connectionId, connection.id))
        .orderBy(desc(metaAssets.isSelected));
      return {
        assets: rows.map((row) =>
          metaAssetSchema.parse({
            id: row.id,
            connectionId: row.connectionId,
            kind: row.kind,
            providerAssetId: row.providerAssetId,
            name: row.name,
            status: row.status,
            isSelected: row.isSelected,
            metadata: row.metadata,
          }),
        ),
      };
    },
  );

  // ---- Ad Profiles ----

  app.get('/meta/ad-profiles', { onRequest: [requirePermission('meta:read')] }, async (request) => {
    const auth = requireAuth(request);
    const rows = await db
      .select()
      .from(metaAdProfiles)
      .where(eq(metaAdProfiles.orgId, auth.orgId))
      .orderBy(desc(metaAdProfiles.createdAt));
    return { adProfiles: rows.map((row) => toAdProfileDto(row)) };
  });

  app.post(
    '/meta/ad-profiles',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = prepareCampaignRequestSchema.parse(request.body);
      const meta = app.metaAds;
      if (!meta) {
        throw new DomainError('INVALID_INPUT', 'Meta Ads não configurado');
      }

      const [property] = await db
        .select()
        .from(properties)
        .where(and(eq(properties.id, input.propertyId), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Imóvel não encontrado');
      }
      const [listing] = input.listingId
        ? await db
            .select()
            .from(listings)
            .where(and(eq(listings.id, input.listingId), eq(listings.orgId, auth.orgId)))
            .limit(1)
        : [undefined];
      const mediaRows = await db
        .select()
        .from(propertyMedia)
        .where(and(eq(propertyMedia.orgId, auth.orgId), eq(propertyMedia.propertyId, property.id)));
      const [settings] = await db
        .select()
        .from(metaOrgSettings)
        .where(eq(metaOrgSettings.orgId, auth.orgId))
        .limit(1);

      const material = validateAdMaterial({
        propertyId: property.id,
        propertyStatus: property.status,
        listingStatus: listing?.status ?? null,
        landingUrl: input.landingUrl,
        mediaSelection: input.mediaSelection,
        mediaRows: mediaRows.map((m) => ({
          id: m.id,
          propertyId: m.propertyId,
          kind: m.kind,
          isPublic: m.isPublic,
        })),
        copyPrimary: input.copyPrimary,
      });
      if (!material.valid) {
        throw new DomainError('INVALID_INPUT', material.errors.join('; '));
      }
      const housing = validateHousingTargeting(
        { geos: input.geos ?? [] },
        (settings?.allowedGeos ?? []) as unknown[],
      );
      if (!housing.valid) {
        throw new DomainError('INVALID_INPUT', housing.errors.join('; '));
      }
      const budgetInput: Parameters<typeof validateBudget>[0] = {
        limits: {
          maxDailyBudgetCents: settings?.maxDailyBudgetCents ?? 10_000_00,
          maxLifetimeBudgetCents: settings?.maxLifetimeBudgetCents ?? 100_000_00,
        },
      };
      if (input.dailyBudgetCents !== undefined) {
        budgetInput.dailyBudgetCents = input.dailyBudgetCents;
      }
      if (input.lifetimeBudgetCents !== undefined) {
        budgetInput.lifetimeBudgetCents = input.lifetimeBudgetCents;
      }
      const budget = validateBudget(budgetInput);
      if (!budget.valid) {
        throw new DomainError('INVALID_INPUT', budget.errors.join('; '));
      }

      const adProfile = first(
        await db
          .insert(metaAdProfiles)
          .values({
            orgId: auth.orgId,
            connectionId: input.connectionId,
            propertyId: property.id,
            listingId: listing?.id ?? null,
            name: input.name,
            objective: input.objective,
            dailyBudgetCents: input.dailyBudgetCents ?? null,
            lifetimeBudgetCents: input.lifetimeBudgetCents ?? null,
            startAt: input.startAt ? new Date(input.startAt) : null,
            endAt: input.endAt ? new Date(input.endAt) : null,
            geos: (input.geos ?? []) as never,
            mediaSelection: input.mediaSelection as never,
            pageAssetId: input.pageAssetId ?? null,
            instagramAssetId: input.instagramAssetId ?? null,
            landingUrl: input.landingUrl,
            copyPrimary: input.copyPrimary,
            copyVariants: (input.copyVariants ?? []) as never,
            specialAdCategories: requiredSpecialAdCategories() as never,
            status: 'PREPARED',
            idempotencyKey: input.idempotencyKey,
            preparedAt: new Date(),
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.META_AD_PROFILE_PREPARED,
        entityType: 'META_AD_PROFILE',
        entityId: adProfile.id,
        payload: { propertyId: property.id, budgetKind: budget.kind },
      });
      return reply.status(201).send({ adProfile: toAdProfileDto(adProfile) });
    },
  );

  // ---- Campanhas ----

  app.get('/meta/campaigns', { onRequest: [requirePermission('meta:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listCampaignsQuerySchema.parse(request.query);
    const where = and(
      eq(metaCampaignLinks.orgId, auth.orgId),
      query.status ? eq(metaCampaignLinks.status, query.status) : undefined,
      query.propertyId
        ? eq(
            metaCampaignLinks.adProfileId,
            propertyProfilesSubquery(db, auth.orgId, query.propertyId),
          )
        : undefined,
    );
    const rows = await db
      .select()
      .from(metaCampaignLinks)
      .where(where)
      .orderBy(desc(metaCampaignLinks.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return { campaigns: rows.map((row) => toCampaignDto(row)), total: rows.length };
  });

  app.get(
    '/meta/campaigns/:id',
    { onRequest: [requirePermission('meta:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [campaign] = await db
        .select()
        .from(metaCampaignLinks)
        .where(and(eq(metaCampaignLinks.id, id), eq(metaCampaignLinks.orgId, auth.orgId)))
        .limit(1);
      if (!campaign) {
        throw new DomainError('NOT_FOUND', 'Campanha não encontrada');
      }
      const [adset] = await db
        .select()
        .from(metaAdsetLinks)
        .where(eq(metaAdsetLinks.campaignLinkId, campaign.id))
        .limit(1);
      const [creative] = adset
        ? await db
            .select()
            .from(metaCreativeLinks)
            .where(eq(metaCreativeLinks.adsetLinkId, adset.id))
            .limit(1)
        : [undefined];
      const [ad] = adset
        ? await db.select().from(metaAdLinks).where(eq(metaAdLinks.adsetLinkId, adset.id)).limit(1)
        : [undefined];
      return metaCampaignDetailSchema.parse({
        ...(toCampaignDto(campaign) as Record<string, unknown>),
        adset: adset
          ? {
              id: adset.id,
              providerAdsetId: adset.providerAdsetId,
              name: adset.name,
              status: adset.status,
              targeting: adset.targeting,
            }
          : null,
        creative: creative
          ? {
              id: creative.id,
              providerCreativeId: creative.providerCreativeId,
              name: creative.name,
              mediaRefs: creative.mediaRefs as string[],
              copyPrimary: creative.copyPrimary,
              landingUrl: creative.landingUrl,
              mediaHash: creative.mediaHash,
              status: creative.status,
            }
          : null,
        ad: ad ? { id: ad.id, providerAdId: ad.providerAdId, status: ad.status } : null,
      });
    },
  );

  app.get(
    '/meta/campaigns/:id/preview',
    { onRequest: [requirePermission('meta:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [campaign] = await db
        .select()
        .from(metaCampaignLinks)
        .where(and(eq(metaCampaignLinks.id, id), eq(metaCampaignLinks.orgId, auth.orgId)))
        .limit(1);
      if (!campaign) {
        throw new DomainError('NOT_FOUND', 'Campanha não encontrada');
      }
      const [profile] = await db
        .select()
        .from(metaAdProfiles)
        .where(eq(metaAdProfiles.id, campaign.adProfileId))
        .limit(1);
      return metaPreviewSchema.parse({
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        copyPrimary: profile?.copyPrimary ?? '',
        landingUrl: profile?.landingUrl ?? '',
        mediaSelection: (profile?.mediaSelection ?? []) as string[],
        specialAdCategories: campaign.specialAdCategories as string[],
        dailyBudgetCents: campaign.dailyBudgetCents,
        lifetimeBudgetCents: campaign.lifetimeBudgetCents,
        status: campaign.status,
      });
    },
  );

  app.post(
    '/meta/ad-profiles/:id/create-campaign',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = createCampaignRequestSchema.parse(request.body);
      const meta = app.metaAds;
      if (!meta) {
        throw new DomainError('INVALID_INPUT', 'Meta Ads não configurado');
      }
      const [profile] = await db
        .select()
        .from(metaAdProfiles)
        .where(and(eq(metaAdProfiles.id, id), eq(metaAdProfiles.orgId, auth.orgId)))
        .limit(1);
      if (!profile) {
        throw new DomainError('NOT_FOUND', 'AdProfile não encontrado');
      }
      // Idempotência: retry com mesma key não duplica a árvore da campanha.
      const [existingCampaign] = await db
        .select()
        .from(metaCampaignLinks)
        .where(eq(metaCampaignLinks.adProfileId, profile.id))
        .limit(1);
      if (existingCampaign) {
        return reply.status(200).send({ campaign: toCampaignDto(existingCampaign), reused: true });
      }
      void input; // validação de contrato (idempotencyKey) — árvore reusa key do profile
      transitionAdProfile(profile.status, 'CREATED');

      const mediaHash = digestInput([...(profile.mediaSelection as string[])].sort().join(':'));
      const result = await createPausedCampaign(meta, {
        campaign: {
          name: profile.name,
          objective: profile.objective,
          specialAdCategories: profile.specialAdCategories as string[],
          dailyBudgetCents: profile.dailyBudgetCents,
          lifetimeBudgetCents: profile.lifetimeBudgetCents,
          startAt: profile.startAt?.toISOString() ?? null,
          endAt: profile.endAt?.toISOString() ?? null,
        },
        adset: {
          name: `${profile.name} — Ad Set`,
          targeting: { geos: profile.geos as never },
          budgetCents: profile.dailyBudgetCents ?? profile.lifetimeBudgetCents ?? 0,
          startAt: profile.startAt?.toISOString() ?? null,
          endAt: profile.endAt?.toISOString() ?? null,
        },
        creative: {
          name: `${profile.name} — Criativo`,
          mediaRefs: profile.mediaSelection as string[],
          copyPrimary: profile.copyPrimary,
          landingUrl: profile.landingUrl,
          mediaHash,
        },
      });

      const campaignLink = first(
        await db
          .insert(metaCampaignLinks)
          .values({
            orgId: auth.orgId,
            adProfileId: profile.id,
            providerCampaignId: result.providerCampaignId ?? '',
            name: profile.name,
            objective: profile.objective,
            specialAdCategories: profile.specialAdCategories as never,
            dailyBudgetCents: profile.dailyBudgetCents,
            lifetimeBudgetCents: profile.lifetimeBudgetCents,
            startAt: profile.startAt,
            endAt: profile.endAt,
            status: 'CREATED_PAUSED',
          })
          .returning(),
      );
      const adsetLink = first(
        await db
          .insert(metaAdsetLinks)
          .values({
            orgId: auth.orgId,
            campaignLinkId: campaignLink.id,
            providerAdsetId: result.providerAdsetId ?? '',
            name: `${profile.name} — Ad Set`,
            targeting: { geos: profile.geos as never },
            budgetCents: profile.dailyBudgetCents ?? profile.lifetimeBudgetCents ?? 0,
            startAt: profile.startAt,
            endAt: profile.endAt,
            status: 'CREATED_PAUSED',
          })
          .returning(),
      );
      const creativeLink = first(
        await db
          .insert(metaCreativeLinks)
          .values({
            orgId: auth.orgId,
            adsetLinkId: adsetLink.id,
            providerCreativeId: result.providerCreativeId ?? '',
            name: `${profile.name} — Criativo`,
            mediaRefs: profile.mediaSelection as never,
            copyPrimary: profile.copyPrimary,
            landingUrl: profile.landingUrl,
            mediaHash,
            status: 'CREATED_PAUSED',
          })
          .returning(),
      );
      await db.insert(metaAdLinks).values({
        orgId: auth.orgId,
        adsetLinkId: adsetLink.id,
        creativeLinkId: creativeLink.id,
        providerAdId: result.providerAdId ?? '',
        status: 'CREATED_PAUSED',
      });
      await db
        .update(metaAdProfiles)
        .set({ status: 'CREATED', updatedAt: new Date() })
        .where(eq(metaAdProfiles.id, profile.id));
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.META_CAMPAIGN_CREATED,
        entityType: 'META_CAMPAIGN',
        entityId: campaignLink.id,
        payload: { adProfileId: profile.id },
      });
      return reply.status(201).send({ campaign: toCampaignDto(campaignLink) });
    },
  );

  // ---- Intents (alta impacto: enfileira; execução no worker) ----

  async function enqueueIntent(
    orgId: string,
    userId: string,
    input: { idempotencyKey: string },
    jobType: string,
    adProfileId: string | null,
    payload: Record<string, unknown>,
    auditAction: string,
  ): Promise<{ queued: boolean; jobId: string | null }> {
    const rows = await db
      .insert(metaSyncJobs)
      .values({
        orgId,
        adProfileId,
        jobType,
        idempotencyKey: input.idempotencyKey,
        payload,
      })
      .onConflictDoNothing()
      .returning();
    const job = rows[0] ?? null;
    if (job) {
      await writeAudit(db, {
        orgId,
        actorUserId: userId,
        action: auditAction,
        entityType: 'META_SYNC_JOB',
        entityId: job.id,
        payload: { jobType },
      });
    }
    return { queued: job !== null, jobId: job?.id ?? null };
  }

  app.post(
    '/meta/campaigns/:id/publish',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = campaignActionRequestSchema.parse(request.body);
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        input,
        'PUBLISH_INTENT',
        null,
        { campaignLinkId: id },
        AUDIT_ACTIONS.META_CAMPAIGN_PUBLISHED,
      );
      return reply.status(202).send(result);
    },
  );

  app.post(
    '/meta/campaigns/:id/pause',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = campaignActionRequestSchema.parse(request.body);
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        input,
        'PAUSE',
        null,
        { campaignLinkId: id },
        AUDIT_ACTIONS.META_CAMPAIGN_PAUSED,
      );
      return reply.status(202).send(result);
    },
  );

  app.post(
    '/meta/campaigns/:id/resume',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = campaignActionRequestSchema.parse(request.body);
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        input,
        'RESUME',
        null,
        { campaignLinkId: id },
        AUDIT_ACTIONS.META_CAMPAIGN_RESUMED,
      );
      return reply.status(202).send(result);
    },
  );

  app.post(
    '/meta/campaigns/:id/archive',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = campaignActionRequestSchema.parse(request.body);
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        input,
        'ARCHIVE',
        null,
        { campaignLinkId: id },
        AUDIT_ACTIONS.META_CAMPAIGN_ARCHIVED,
      );
      return reply.status(202).send(result);
    },
  );

  app.post(
    '/meta/campaigns/:id/budget',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateBudgetRequestSchema.parse(request.body);
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        input,
        'UPDATE_BUDGET',
        null,
        {
          campaignLinkId: id,
          dailyBudgetCents: input.dailyBudgetCents,
          lifetimeBudgetCents: input.lifetimeBudgetCents,
        },
        AUDIT_ACTIONS.META_BUDGET_UPDATED,
      );
      return reply.status(202).send(result);
    },
  );

  app.post(
    '/meta/campaigns/:id/schedule',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateScheduleRequestSchema.parse(request.body);
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        input,
        'UPDATE_SCHEDULE',
        null,
        { campaignLinkId: id, startAt: input.startAt, endAt: input.endAt },
        AUDIT_ACTIONS.META_SCHEDULE_UPDATED,
      );
      return reply.status(202).send(result);
    },
  );

  app.post(
    '/meta/campaigns/:id/creative',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateCreativeRequestSchema.parse(request.body);
      const [campaign] = await db
        .select()
        .from(metaCampaignLinks)
        .where(and(eq(metaCampaignLinks.id, id), eq(metaCampaignLinks.orgId, auth.orgId)))
        .limit(1);
      if (!campaign) {
        throw new DomainError('NOT_FOUND', 'Campanha não encontrada');
      }
      const [adset] = await db
        .select()
        .from(metaAdsetLinks)
        .where(eq(metaAdsetLinks.campaignLinkId, campaign.id))
        .limit(1);
      if (!adset) {
        throw new DomainError('NOT_FOUND', 'Ad Set não encontrado');
      }
      const [creative] = await db
        .select()
        .from(metaCreativeLinks)
        .where(eq(metaCreativeLinks.adsetLinkId, adset.id))
        .limit(1);
      if (!creative) {
        throw new DomainError('NOT_FOUND', 'Criativo não encontrado');
      }
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        input,
        'UPDATE_CREATIVE',
        null,
        {
          creativeLinkId: creative.id,
          copyPrimary: input.copyPrimary,
          mediaRefs: input.mediaSelection,
        },
        AUDIT_ACTIONS.META_CREATIVE_UPDATED,
      );
      return reply.status(202).send(result);
    },
  );

  // ---- Insights ----

  app.post(
    '/meta/campaigns/:id/sync-insights',
    { onRequest: [requirePermission('meta:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = syncInsightsRequestSchema.parse(request.body);
      const [campaign] = await db
        .select()
        .from(metaCampaignLinks)
        .where(and(eq(metaCampaignLinks.id, id), eq(metaCampaignLinks.orgId, auth.orgId)))
        .limit(1);
      if (!campaign) {
        throw new DomainError('NOT_FOUND', 'Campanha não encontrada');
      }
      const result = await enqueueIntent(
        auth.orgId,
        auth.userId,
        { idempotencyKey: `sync-${campaign.id}-${input.dateStart ?? 'auto'}` },
        'SYNC_INSIGHTS',
        campaign.adProfileId,
        { campaignLinkId: campaign.id, dateStart: input.dateStart, dateEnd: input.dateEnd },
        AUDIT_ACTIONS.META_INSIGHTS_SYNCED,
      );
      return reply.status(202).send(result);
    },
  );

  return Promise.resolve();
};

function propertyProfilesSubquery(db: AppDb, orgId: string, propertyId: string) {
  return db
    .select({ id: metaAdProfiles.id })
    .from(metaAdProfiles)
    .where(and(eq(metaAdProfiles.orgId, orgId), eq(metaAdProfiles.propertyId, propertyId)))
    .limit(1);
}

function toAdProfileDto(row: typeof metaAdProfiles.$inferSelect): unknown {
  return metaAdProfileSchema.parse({
    id: row.id,
    orgId: row.orgId,
    connectionId: row.connectionId,
    propertyId: row.propertyId,
    listingId: row.listingId,
    name: row.name,
    objective: row.objective,
    dailyBudgetCents: row.dailyBudgetCents,
    lifetimeBudgetCents: row.lifetimeBudgetCents,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    geos: row.geos,
    mediaSelection: row.mediaSelection,
    pageAssetId: row.pageAssetId,
    instagramAssetId: row.instagramAssetId,
    landingUrl: row.landingUrl,
    copyPrimary: row.copyPrimary,
    copyVariants: row.copyVariants as string[],
    specialAdCategories: row.specialAdCategories as string[],
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    preparedAt: row.preparedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toCampaignDto(row: typeof metaCampaignLinks.$inferSelect): unknown {
  return metaCampaignLinkSchema.parse({
    id: row.id,
    orgId: row.orgId,
    adProfileId: row.adProfileId,
    providerCampaignId: row.providerCampaignId,
    name: row.name,
    objective: row.objective,
    specialAdCategories: row.specialAdCategories as string[],
    dailyBudgetCents: row.dailyBudgetCents,
    lifetimeBudgetCents: row.lifetimeBudgetCents,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    status: row.status,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
