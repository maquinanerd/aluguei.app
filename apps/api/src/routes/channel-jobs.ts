import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  channelSyncJobs,
  listings,
  listingChannelPublications,
  properties,
  propertyAddresses,
  propertyFeatures,
  propertyFinancialTerms,
  propertyMedia,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import type { ChannelJobType, IListingChannelAdapter } from '@aluguei/integrations';
import { DomainError, isChannelJobType } from '@aluguei/domain';

/** Serializa payload para hash canônico (chaves ordenadas). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildIdempotencyKey(
  orgId: string,
  listingId: string | null,
  channel: string,
  jobType: ChannelJobType,
  payload?: unknown,
): string {
  const base = `${orgId}:${listingId ?? '*'}:${channel}:${jobType}`;
  if (jobType === 'UPDATE' && payload !== undefined) {
    return `${base}:${createHash('sha256').update(canonicalJson(payload)).digest('hex')}`;
  }
  if (jobType === 'IMPORT_LEADS') {
    return `${base}:${String(Date.now())}`;
  }
  return base;
}

export interface EnqueueJobInput {
  orgId: string;
  listingId?: string | null;
  channel: string;
  jobType: ChannelJobType;
  payload?: Record<string, unknown>;
  runAt?: Date;
}

/** Enfileira job de canal com idempotência (retry reusa a mesma linha). */
export async function enqueueChannelJob(
  db: AppDb,
  input: EnqueueJobInput,
): Promise<typeof channelSyncJobs.$inferSelect> {
  if (!isChannelJobType(input.jobType)) {
    throw new DomainError('INVALID_INPUT', 'Tipo de job inválido');
  }
  const idempotencyKey = buildIdempotencyKey(
    input.orgId,
    input.listingId ?? null,
    input.channel,
    input.jobType,
    input.payload,
  );
  const values = {
    orgId: input.orgId,
    listingId: input.listingId ?? null,
    channel: input.channel,
    jobType: input.jobType,
    idempotencyKey,
    payload: input.payload ?? null,
    runAt: input.runAt ?? new Date(),
  };
  const [job] = await db
    .insert(channelSyncJobs)
    .values(values)
    .onConflictDoUpdate({
      target: channelSyncJobs.idempotencyKey,
      set: {
        status: 'PENDING',
        runAt: values.runAt,
        attempts: 0,
        lastError: null,
        payload: values.payload,
      },
    })
    .returning();
  if (!job) {
    throw new Error('enqueueChannelJob: insert failed');
  }
  return job;
}

/** Monta o ChannelListingInput (fonte única: property_financial_terms para preço). */
export async function buildChannelListingInput(
  db: AppDb,
  orgId: string,
  listing: typeof listings.$inferSelect,
): Promise<Parameters<IListingChannelAdapter['publish']>[0]> {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId))
    .limit(1);
  if (!property) {
    throw new DomainError('NOT_FOUND', 'Imóvel do anúncio não encontrado');
  }
  const [terms] = await db
    .select()
    .from(propertyFinancialTerms)
    .where(eq(propertyFinancialTerms.propertyId, property.id))
    .limit(1);
  const [publicAddress] = await db
    .select()
    .from(propertyAddresses)
    .where(and(eq(propertyAddresses.propertyId, property.id), eq(propertyAddresses.isPublic, true)))
    .limit(1);
  const features = await db
    .select({ feature: propertyFeatures.feature })
    .from(propertyFeatures)
    .where(eq(propertyFeatures.propertyId, property.id));
  const media = await db
    .select()
    .from(propertyMedia)
    .where(
      and(
        eq(propertyMedia.propertyId, property.id),
        eq(propertyMedia.isPublic, true),
        inArray(propertyMedia.kind, ['PHOTO', 'FLOORPLAN']),
      ),
    );

  return {
    externalId: listing.id,
    title: listing.title,
    description: listing.description,
    monthlyRentCents: terms?.monthlyRentCents ?? 0,
    publicAddress: publicAddress
      ? {
          neighborhood: publicAddress.neighborhood,
          city: publicAddress.city,
          state: publicAddress.state,
          country: publicAddress.country,
        }
      : null,
    propertyType: property.propertyType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    parkingSpots: property.parkingSpots,
    furnished: property.furnished,
    petsAllowed: property.petsAllowed,
    features: features.map((f) => f.feature),
    media: media.map((m) => ({
      kind: m.kind as 'PHOTO' | 'FLOORPLAN',
      storageKey: m.storageKey,
      mimeType: m.mimeType,
    })),
  };
}

/**
 * Enfileira UPDATE nos canais com publicação ativa do property (preço/fotos/
 * endereço mudaram). Idempotência: mesma chave reusa a linha; o worker
 * recarrega o conteúdo do DB na execução.
 */
export async function enqueueUpdatesForProperty(
  db: AppDb,
  orgId: string,
  propertyId: string,
): Promise<number> {
  const listingRows = await db.select().from(listings).where(eq(listings.propertyId, propertyId));
  const listingIds = listingRows.map((l) => l.id);
  if (listingIds.length === 0) {
    return 0;
  }
  const active = await db
    .select()
    .from(listingChannelPublications)
    .where(
      and(
        eq(listingChannelPublications.orgId, orgId),
        eq(listingChannelPublications.status, 'PUBLISHED'),
        inArray(listingChannelPublications.listingId, listingIds),
      ),
    );
  for (const publication of active) {
    await enqueueChannelJob(db, {
      orgId,
      listingId: publication.listingId,
      channel: publication.channel,
      jobType: 'UPDATE',
      payload: { listingId: publication.listingId },
    });
  }
  return active.length;
}
