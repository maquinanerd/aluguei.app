import { and, desc, eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import {
  createPausedCampaign,
  requiredSpecialAdCategories,
  validateAdMaterial,
  validateBudget,
  validateHousingTargeting,
} from '@aluguei/domain';
import { digestInput } from '@aluguei/config';
import {
  listings,
  metaAdLinks,
  metaAdProfiles,
  metaAdsetLinks,
  metaAssets,
  metaCampaignLinks,
  metaConnections,
  metaCreativeLinks,
  metaInsightSnapshots,
  metaOrgSettings,
  metaSyncJobs,
  properties,
  propertyMedia,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { recordToolCall } from './audit.js';
import { invalidInput, notFound, toToolError } from './errors.js';
import type { McpContext } from './context.js';

const orgIdSchema = z.uuid();
const idempotencySchema = z.string().min(8).max(64);

type Ctx = McpContext;

/** Enfileira intent de alta impacto em meta_sync_jobs (idempotente). */
async function enqueueIntent(
  db: AppDb,
  orgId: string,
  jobType: string,
  adProfileId: string | null,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ queued: boolean; jobId: string | null }> {
  const rows = await db
    .insert(metaSyncJobs)
    .values({ orgId, adProfileId, jobType, idempotencyKey, payload })
    .onConflictDoNothing()
    .returning();
  return { queued: rows[0] !== undefined, jobId: rows[0]?.id ?? null };
}

async function resolveCampaignLink(db: AppDb, orgId: string, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(metaCampaignLinks)
    .where(and(eq(metaCampaignLinks.id, campaignId), eq(metaCampaignLinks.orgId, orgId)))
    .limit(1);
  return campaign ?? null;
}

async function resolveProfile(db: AppDb, orgId: string, adProfileId: string) {
  const [profile] = await db
    .select()
    .from(metaAdProfiles)
    .where(and(eq(metaAdProfiles.id, adProfileId), eq(metaAdProfiles.orgId, orgId)))
    .limit(1);
  return profile ?? null;
}

export function registerTools(server: McpServer, ctx: Ctx): void {
  const { db, meta } = ctx;

  // ---------- LEITURA ----------

  server.registerTool(
    'meta_connection_status',
    {
      description: 'Status da conexão Meta da organização (sem expor token).',
      inputSchema: {
        orgId: orgIdSchema,
      },
    },
    async (args) => {
      try {
        const rows = await db
          .select({
            id: metaConnections.id,
            status: metaConnections.status,
            providerUserId: metaConnections.providerUserId,
            lastTestedAt: metaConnections.lastTestedAt,
          })
          .from(metaConnections)
          .where(eq(metaConnections.orgId, args.orgId))
          .orderBy(desc(metaConnections.createdAt));
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_connection_status',
          action: AUDIT_ACTIONS.META_TOOL_CALLED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                connections: rows.map((r) => ({
                  id: r.id,
                  status: r.status,
                  providerUserId: r.providerUserId,
                  lastTestedAt: r.lastTestedAt?.toISOString() ?? null,
                })),
              }),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_list_assets',
    {
      description:
        'Lista ativos autorizados (ad accounts, pages, instagram, business) de uma conexão.',
      inputSchema: {
        orgId: orgIdSchema,
        connectionId: z.uuid(),
      },
    },
    async (args) => {
      try {
        const rows = await db
          .select()
          .from(metaAssets)
          .where(
            and(eq(metaAssets.orgId, args.orgId), eq(metaAssets.connectionId, args.connectionId)),
          )
          .orderBy(desc(metaAssets.isSelected));
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_list_assets',
          action: AUDIT_ACTIONS.META_TOOL_CALLED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                assets: rows.map((r) => ({
                  id: r.id,
                  kind: r.kind,
                  providerAssetId: r.providerAssetId,
                  name: r.name,
                  status: r.status,
                  isSelected: r.isSelected,
                })),
              }),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_get_property_ad_material',
    {
      description: 'Material ad-ready de um imóvel (landing, mídia pública, copy) — sem PII.',
      inputSchema: {
        orgId: orgIdSchema,
        propertyId: z.uuid(),
      },
    },
    async (args) => {
      try {
        const [property] = await db
          .select()
          .from(properties)
          .where(and(eq(properties.id, args.propertyId), eq(properties.orgId, args.orgId)))
          .limit(1);
        if (!property) throw notFound('Imóvel não encontrado');
        const [listing] = await db
          .select()
          .from(listings)
          .where(and(eq(listings.propertyId, property.id), eq(listings.orgId, args.orgId)))
          .orderBy(desc(listings.createdAt))
          .limit(1);
        const media = await db
          .select()
          .from(propertyMedia)
          .where(and(eq(propertyMedia.propertyId, property.id), eq(propertyMedia.isPublic, true)))
          .orderBy(desc(propertyMedia.createdAt));
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_get_property_ad_material',
          action: AUDIT_ACTIONS.META_TOOL_CALLED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                property: { id: property.id, status: property.status },
                listing: listing
                  ? { id: listing.id, status: listing.status, title: listing.title }
                  : null,
                media: media.map((m) => ({
                  id: m.id,
                  kind: m.kind,
                  isPublic: m.isPublic,
                  mimeType: m.mimeType,
                })),
              }),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_get_campaign',
    {
      description: 'Detalhe de uma campanha (campaign/adset/creative/ad links) da organização.',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
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
          ? await db
              .select()
              .from(metaAdLinks)
              .where(eq(metaAdLinks.adsetLinkId, adset.id))
              .limit(1)
          : [undefined];
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_get_campaign',
          action: AUDIT_ACTIONS.META_TOOL_CALLED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                campaign: {
                  id: campaign.id,
                  name: campaign.name,
                  objective: campaign.objective,
                  status: campaign.status,
                  providerCampaignId: campaign.providerCampaignId,
                },
                adset: adset ? { id: adset.id, name: adset.name, status: adset.status } : null,
                creative: creative
                  ? {
                      id: creative.id,
                      name: creative.name,
                      mediaHash: creative.mediaHash,
                      status: creative.status,
                    }
                  : null,
                ad: ad ? { id: ad.id, providerAdId: ad.providerAdId, status: ad.status } : null,
              }),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_preview_campaign',
    {
      description: 'Preview do anúncio (copy, mídia, orçamento, categoria especial).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const [profile] = await db
          .select()
          .from(metaAdProfiles)
          .where(eq(metaAdProfiles.id, campaign.adProfileId))
          .limit(1);
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_preview_campaign',
          action: AUDIT_ACTIONS.META_TOOL_CALLED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                name: campaign.name,
                copyPrimary: profile?.copyPrimary ?? '',
                landingUrl: profile?.landingUrl ?? '',
                mediaSelection: profile?.mediaSelection ?? [],
                specialAdCategories: campaign.specialAdCategories,
                dailyBudgetCents: campaign.dailyBudgetCents,
                lifetimeBudgetCents: campaign.lifetimeBudgetCents,
                status: campaign.status,
              }),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_get_insights',
    {
      description: 'Último snapshot de insights da campanha (spend em centavos, derivado).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const [snapshot] = await db
          .select()
          .from(metaInsightSnapshots)
          .where(eq(metaInsightSnapshots.campaignLinkId, campaign.id))
          .orderBy(desc(metaInsightSnapshots.syncedAt))
          .limit(1);
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_get_insights',
          action: AUDIT_ACTIONS.META_TOOL_CALLED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                snapshot
                  ? {
                      campaignLinkId: snapshot.campaignLinkId,
                      dateStart: snapshot.dateStart,
                      dateEnd: snapshot.dateEnd,
                      insights: snapshot.insights,
                      syncedAt: snapshot.syncedAt.toISOString(),
                    }
                  : {
                      campaignLinkId: campaign.id,
                      insights: null,
                      message: 'Nenhum snapshot ainda — chame meta_sync_insights',
                    },
              ),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_list_property_campaigns',
    {
      description: 'Campanhas de um imóvel da organização.',
      inputSchema: {
        orgId: orgIdSchema,
        propertyId: z.uuid(),
      },
    },
    async (args) => {
      try {
        const [property] = await db
          .select({ id: properties.id })
          .from(properties)
          .where(and(eq(properties.id, args.propertyId), eq(properties.orgId, args.orgId)))
          .limit(1);
        if (!property) throw notFound('Imóvel não encontrado');
        const profiles = await db
          .select({ id: metaAdProfiles.id })
          .from(metaAdProfiles)
          .where(
            and(
              eq(metaAdProfiles.orgId, args.orgId),
              eq(metaAdProfiles.propertyId, args.propertyId),
            ),
          );
        const profileIds = profiles.map((p) => p.id);
        const rows =
          profileIds.length > 0
            ? await db
                .select()
                .from(metaCampaignLinks)
                .where(
                  and(
                    eq(metaCampaignLinks.orgId, args.orgId),
                    eq(metaCampaignLinks.adProfileId, profileIds[0] as string),
                  ),
                )
            : [];
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_list_property_campaigns',
          action: AUDIT_ACTIONS.META_TOOL_CALLED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                campaigns: rows.map((r) => ({
                  id: r.id,
                  name: r.name,
                  status: r.status,
                  objective: r.objective,
                  providerCampaignId: r.providerCampaignId,
                })),
              }),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  // ---------- ESCRITA CONTROLADA ----------

  server.registerTool(
    'meta_prepare_property_campaign',
    {
      description: 'Prepara um AdProfile validado (material, Housing, budget) para um imóvel.',
      inputSchema: {
        orgId: orgIdSchema,
        connectionId: z.uuid(),
        propertyId: z.uuid(),
        listingId: z.uuid().optional(),
        name: z.string().min(1).max(120),
        objective: z.enum(['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT']),
        dailyBudgetCents: z.number().int().nonnegative().optional(),
        lifetimeBudgetCents: z.number().int().nonnegative().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        geos: z.array(z.record(z.string(), z.unknown())).optional(),
        mediaSelection: z.array(z.uuid()).min(1),
        pageAssetId: z.uuid().optional(),
        instagramAssetId: z.uuid().optional(),
        landingUrl: z.url().refine((u) => u.startsWith('https://'), 'Landing exige HTTPS'),
        copyPrimary: z.string().min(1).max(500),
        copyVariants: z.array(z.string().min(1).max(500)).optional(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        if (!meta) throw invalidInput('Meta Ads não configurado');
        const [property] = await db
          .select()
          .from(properties)
          .where(and(eq(properties.id, args.propertyId), eq(properties.orgId, args.orgId)))
          .limit(1);
        if (!property) throw notFound('Imóvel não encontrado');
        const [listing] = args.listingId
          ? await db
              .select()
              .from(listings)
              .where(and(eq(listings.id, args.listingId), eq(listings.orgId, args.orgId)))
              .limit(1)
          : [undefined];
        const mediaRows = await db
          .select()
          .from(propertyMedia)
          .where(
            and(eq(propertyMedia.orgId, args.orgId), eq(propertyMedia.propertyId, property.id)),
          );
        const [settings] = await db
          .select()
          .from(metaOrgSettings)
          .where(eq(metaOrgSettings.orgId, args.orgId))
          .limit(1);

        const material = validateAdMaterial({
          propertyId: property.id,
          propertyStatus: property.status,
          listingStatus: listing?.status ?? null,
          landingUrl: args.landingUrl,
          mediaSelection: args.mediaSelection,
          mediaRows: mediaRows.map((m) => ({
            id: m.id,
            propertyId: m.propertyId,
            kind: m.kind,
            isPublic: m.isPublic,
          })),
          copyPrimary: args.copyPrimary,
        });
        if (!material.valid) throw invalidInput(material.errors.join('; '));
        const housing = validateHousingTargeting(
          { geos: args.geos ?? [] },
          (settings?.allowedGeos ?? []) as unknown[],
        );
        if (!housing.valid) throw invalidInput(housing.errors.join('; '));
        const budgetInput: Parameters<typeof validateBudget>[0] = {
          limits: {
            maxDailyBudgetCents: settings?.maxDailyBudgetCents ?? 10_000_00,
            maxLifetimeBudgetCents: settings?.maxLifetimeBudgetCents ?? 100_000_00,
          },
        };
        if (args.dailyBudgetCents !== undefined)
          budgetInput.dailyBudgetCents = args.dailyBudgetCents;
        if (args.lifetimeBudgetCents !== undefined)
          budgetInput.lifetimeBudgetCents = args.lifetimeBudgetCents;
        const budget = validateBudget(budgetInput);
        if (!budget.valid) throw invalidInput(budget.errors.join('; '));

        const rows = await db
          .insert(metaAdProfiles)
          .values({
            orgId: args.orgId,
            connectionId: args.connectionId,
            propertyId: property.id,
            listingId: listing?.id ?? null,
            name: args.name,
            objective: args.objective,
            dailyBudgetCents: args.dailyBudgetCents ?? null,
            lifetimeBudgetCents: args.lifetimeBudgetCents ?? null,
            startAt: args.startAt ? new Date(args.startAt) : null,
            endAt: args.endAt ? new Date(args.endAt) : null,
            geos: (args.geos ?? []) as never,
            mediaSelection: args.mediaSelection as never,
            pageAssetId: args.pageAssetId ?? null,
            instagramAssetId: args.instagramAssetId ?? null,
            landingUrl: args.landingUrl,
            copyPrimary: args.copyPrimary,
            copyVariants: (args.copyVariants ?? []) as never,
            specialAdCategories: requiredSpecialAdCategories() as never,
            status: 'PREPARED',
            idempotencyKey: args.idempotencyKey,
            preparedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning();
        const profile = rows[0];
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_prepare_property_campaign',
          action: AUDIT_ACTIONS.META_AD_PROFILE_PREPARED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        if (!profile) throw invalidInput('AdProfile já preparado com esta idempotencyKey');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                adProfile: {
                  id: profile.id,
                  status: profile.status,
                  propertyId: profile.propertyId,
                  budgetKind: budget.kind,
                },
              }),
            },
          ],
        };
      } catch (err) {
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_prepare_property_campaign',
          action: AUDIT_ACTIONS.META_AD_PROFILE_PREPARED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'ERROR',
          error: err instanceof Error ? err.message : String(err),
        }).catch(() => undefined);
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_create_prepared_campaign_paused',
    {
      description: 'Cria a árvore campaign/adset/creative/ad em CREATED_PAUSED (nunca ACTIVE).',
      inputSchema: {
        orgId: orgIdSchema,
        adProfileId: z.uuid(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        if (!meta) throw invalidInput('Meta Ads não configurado');
        const profile = await resolveProfile(db, args.orgId, args.adProfileId);
        if (!profile) throw notFound('AdProfile não encontrado');
        const existing = await db
          .select()
          .from(metaCampaignLinks)
          .where(eq(metaCampaignLinks.adProfileId, profile.id))
          .limit(1);
        if (existing[0]) {
          await recordToolCall(db, {
            orgId: args.orgId,
            tool: 'meta_create_prepared_campaign_paused',
            action: AUDIT_ACTIONS.META_CAMPAIGN_CREATED,
            idempotencyKey: args.idempotencyKey,
            inputRaw: JSON.stringify(args),
            status: 'SUCCESS',
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  campaign: { id: existing[0].id, status: existing[0].status, reused: true },
                }),
              },
            ],
          };
        }
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
        const [campaign] = await db
          .insert(metaCampaignLinks)
          .values({
            orgId: args.orgId,
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
          .returning();
        const [adset] = await db
          .insert(metaAdsetLinks)
          .values({
            orgId: args.orgId,
            campaignLinkId: campaign?.id ?? '',
            providerAdsetId: result.providerAdsetId ?? '',
            name: `${profile.name} — Ad Set`,
            targeting: { geos: profile.geos as never },
            budgetCents: profile.dailyBudgetCents ?? profile.lifetimeBudgetCents ?? 0,
            startAt: profile.startAt,
            endAt: profile.endAt,
            status: 'CREATED_PAUSED',
          })
          .returning();
        const [creative] = await db
          .insert(metaCreativeLinks)
          .values({
            orgId: args.orgId,
            adsetLinkId: adset?.id ?? '',
            providerCreativeId: result.providerCreativeId ?? '',
            name: `${profile.name} — Criativo`,
            mediaRefs: profile.mediaSelection as never,
            copyPrimary: profile.copyPrimary,
            landingUrl: profile.landingUrl,
            mediaHash,
            status: 'CREATED_PAUSED',
          })
          .returning();
        await db.insert(metaAdLinks).values({
          orgId: args.orgId,
          adsetLinkId: adset?.id ?? '',
          creativeLinkId: creative?.id ?? '',
          providerAdId: result.providerAdId ?? '',
          status: 'CREATED_PAUSED',
        });
        await db
          .update(metaAdProfiles)
          .set({ status: 'CREATED', updatedAt: new Date() })
          .where(eq(metaAdProfiles.id, profile.id));
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_create_prepared_campaign_paused',
          action: AUDIT_ACTIONS.META_CAMPAIGN_CREATED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ campaign: { id: campaign?.id, status: 'CREATED_PAUSED' } }),
            },
          ],
        };
      } catch (err) {
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_create_prepared_campaign_paused',
          action: AUDIT_ACTIONS.META_CAMPAIGN_CREATED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'ERROR',
          error: err instanceof Error ? err.message : String(err),
        }).catch(() => undefined);
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_publish_prepared_campaign',
    {
      description:
        'Publica campanha preparada (ação de runtime): enfileira intent PUBLISH_INTENT. Em dry_run executa no fake.',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const { queued } = await enqueueIntent(
          db,
          args.orgId,
          'PUBLISH_INTENT',
          campaign.adProfileId,
          { campaignLinkId: campaign.id },
          args.idempotencyKey,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_publish_prepared_campaign',
          action: AUDIT_ACTIONS.META_CAMPAIGN_PUBLISHED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                queued,
                status:
                  'intent enfileirado — worker executa (dry_run: fake) — nunca ACTIVE sem ação de runtime',
              }),
            },
          ],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_pause_campaign',
    {
      description: 'Pausa campanha (intent).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const { queued } = await enqueueIntent(
          db,
          args.orgId,
          'PAUSE',
          campaign.adProfileId,
          { campaignLinkId: campaign.id },
          args.idempotencyKey,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_pause_campaign',
          action: AUDIT_ACTIONS.META_CAMPAIGN_PAUSED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ queued }) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_resume_campaign',
    {
      description: 'Retoma campanha (intent).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const { queued } = await enqueueIntent(
          db,
          args.orgId,
          'RESUME',
          campaign.adProfileId,
          { campaignLinkId: campaign.id },
          args.idempotencyKey,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_resume_campaign',
          action: AUDIT_ACTIONS.META_CAMPAIGN_RESUMED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ queued }) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_update_budget',
    {
      description: 'Atualiza orçamento (daily OU lifetime) da campanha (intent).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
        dailyBudgetCents: z.number().int().nonnegative().optional(),
        lifetimeBudgetCents: z.number().int().nonnegative().optional(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        if ((args.dailyBudgetCents === undefined) === (args.lifetimeBudgetCents === undefined)) {
          throw invalidInput('Defina exatamente um orçamento: daily OU lifetime');
        }
        const { queued } = await enqueueIntent(
          db,
          args.orgId,
          'UPDATE_BUDGET',
          campaign.adProfileId,
          {
            campaignLinkId: campaign.id,
            dailyBudgetCents: args.dailyBudgetCents,
            lifetimeBudgetCents: args.lifetimeBudgetCents,
          },
          args.idempotencyKey,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_update_budget',
          action: AUDIT_ACTIONS.META_BUDGET_UPDATED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ queued }) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_update_schedule',
    {
      description: 'Atualiza agendamento da campanha (intent).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
        startAt: z.string().optional(),
        endAt: z.string().nullable().optional(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const { queued } = await enqueueIntent(
          db,
          args.orgId,
          'UPDATE_SCHEDULE',
          campaign.adProfileId,
          { campaignLinkId: campaign.id, startAt: args.startAt, endAt: args.endAt },
          args.idempotencyKey,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_update_schedule',
          action: AUDIT_ACTIONS.META_SCHEDULE_UPDATED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ queued }) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_update_creative',
    {
      description: 'Atualiza copy/mídia do criativo (intent).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
        copyPrimary: z.string().min(1).max(500),
        mediaSelection: z.array(z.uuid()).min(1),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const [adset] = await db
          .select()
          .from(metaAdsetLinks)
          .where(eq(metaAdsetLinks.campaignLinkId, campaign.id))
          .limit(1);
        if (!adset) throw notFound('Ad Set não encontrado');
        const [creative] = await db
          .select()
          .from(metaCreativeLinks)
          .where(eq(metaCreativeLinks.adsetLinkId, adset.id))
          .limit(1);
        if (!creative) throw notFound('Criativo não encontrado');
        const { queued } = await enqueueIntent(
          db,
          args.orgId,
          'UPDATE_CREATIVE',
          campaign.adProfileId,
          {
            creativeLinkId: creative.id,
            copyPrimary: args.copyPrimary,
            mediaRefs: args.mediaSelection,
          },
          args.idempotencyKey,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_update_creative',
          action: AUDIT_ACTIONS.META_CREATIVE_UPDATED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ queued }) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_archive_campaign',
    {
      description: 'Arquiva campanha (intent).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
        idempotencyKey: idempotencySchema,
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const { queued } = await enqueueIntent(
          db,
          args.orgId,
          'ARCHIVE',
          campaign.adProfileId,
          { campaignLinkId: campaign.id },
          args.idempotencyKey,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_archive_campaign',
          action: AUDIT_ACTIONS.META_CAMPAIGN_ARCHIVED,
          idempotencyKey: args.idempotencyKey,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ queued }) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    'meta_sync_insights',
    {
      description: 'Enfileira sync de insights da campanha (snapshot derivado; spend em centavos).',
      inputSchema: {
        orgId: orgIdSchema,
        campaignId: z.uuid(),
      },
    },
    async (args) => {
      try {
        const campaign = await resolveCampaignLink(db, args.orgId, args.campaignId);
        if (!campaign) throw notFound('Campanha não encontrada');
        const { queued, jobId } = await enqueueIntent(
          db,
          args.orgId,
          'SYNC_INSIGHTS',
          campaign.adProfileId,
          { campaignLinkId: campaign.id },
          `sync-${campaign.id}-${String(Math.floor(Date.now() / 60000))}`,
        );
        await recordToolCall(db, {
          orgId: args.orgId,
          tool: 'meta_sync_insights',
          action: AUDIT_ACTIONS.META_INSIGHTS_SYNCED,
          inputRaw: JSON.stringify(args),
          status: 'SUCCESS',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ queued, jobId }) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
