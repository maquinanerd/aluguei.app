import { createHash } from 'node:crypto';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import {
  listingChannelPublications,
  listings,
  organizations,
  properties,
  propertyAddresses,
  propertyFeatures,
  propertyFinancialTerms,
  propertyMedia,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import type { GrupoOlxPropertyType, GrupoOlxPublicationTier } from '@aluguei/contracts';
import type { VrsyncAddress, VrsyncAgency, VrsyncListingInput } from '@aluguei/integrations';

/** Canal do feed do Grupo OLX (ADR-107). */
export const GRUPO_OLX_CHANNEL = 'grupoolx';

/** Anúncios por página na leitura do feed: limita memória e o tamanho de cada consulta. */
export const FEED_PAGE_SIZE = 500;

type PublicationRow = typeof listingChannelPublications.$inferSelect;
type AddressRow = typeof propertyAddresses.$inferSelect;
type MediaRow = typeof propertyMedia.$inferSelect;

export interface FeedRow {
  publication: PublicationRow;
  listing: typeof listings.$inferSelect;
  property: typeof properties.$inferSelect;
  terms: typeof propertyFinancialTerms.$inferSelect | null;
  privateAddress: AddressRow | null;
  publicAddress: AddressRow | null;
  features: string[];
  /** Fotos públicas, na ordem da galeria. */
  photos: MediaRow[];
}

/**
 * Versão da foto na URL de distribuição. O Grupo OLX usa a URL como identidade da imagem e só baixa
 * de novo quando ela muda; a chave de storage nasce com UUID a cada envio, então trocar a foto troca
 * a versão. O tamanho entra para pegar um reenvio na mesma chave dentro da validade da URL assinada.
 */
export function mediaVersion(storageKey: string, sizeBytes: number | null): string {
  return createHash('sha256')
    .update(`${storageKey}:${String(sizeBytes ?? '')}`)
    .digest('hex')
    .slice(0, 16);
}

export function distributionMediaUrl(
  apiPublicUrl: string,
  mediaId: string,
  version: string,
): string {
  return `${apiPublicUrl.replace(/\/+$/, '')}/integrations/grupo-olx/media/${mediaId}/${version}.jpg`;
}

/**
 * Endereço que vai ao portal: a linha privada (completa) manda; a pública completa o que faltar.
 * O que o portal **mostra** é decidido à parte, pelo `displayAddress` (ADR-107).
 */
export function mergeAddress(
  privateAddress: AddressRow | null,
  publicAddress: AddressRow | null,
): VrsyncAddress | null {
  if (!privateAddress && !publicAddress) {
    return null;
  }
  const pick = (
    key: 'street' | 'number' | 'complement' | 'neighborhood' | 'city' | 'state' | 'zipCode',
  ) => privateAddress?.[key] ?? publicAddress?.[key] ?? null;
  // Coordenadas da mesma linha, a privada primeiro (a pública é geocodificada só até o bairro).
  const located = [privateAddress, publicAddress].find(
    (row) => row !== null && row.lat !== null && row.lng !== null,
  );
  return {
    street: pick('street'),
    number: pick('number'),
    complement: pick('complement'),
    neighborhood: pick('neighborhood'),
    city: pick('city'),
    state: pick('state'),
    zipCode: pick('zipCode'),
    lat: located?.lat ?? null,
    lng: located?.lng ?? null,
  };
}

export function toVrsyncInput(row: FeedRow, apiPublicUrl: string): VrsyncListingInput {
  return {
    listingId: row.listing.id,
    listingStatus: row.listing.status,
    title: row.listing.title,
    description: row.listing.description,
    propertyType: row.property.propertyType,
    portalPropertyType: (row.publication.portalPropertyType as GrupoOlxPropertyType | null) ?? null,
    purpose: row.property.purpose,
    monthlyRentCents: row.terms?.monthlyRentCents ?? null,
    salePriceCents: row.terms?.salePriceCents ?? null,
    condoFeeCents: row.terms?.condoFeeCents ?? null,
    iptuCents: row.terms?.iptuCents ?? null,
    builtAreaSqm: row.property.builtAreaSqm,
    totalAreaSqm: row.property.totalAreaSqm,
    bedrooms: row.property.bedrooms,
    bathrooms: row.property.bathrooms,
    suites: row.property.suites,
    parkingSpots: row.property.parkingSpots,
    furnished: row.property.furnished,
    petsAllowed: row.property.petsAllowed,
    features: row.features,
    address: mergeAddress(row.privateAddress, row.publicAddress),
    photos: row.photos.map((media) => ({
      id: media.id,
      url: distributionMediaUrl(
        apiPublicUrl,
        media.id,
        mediaVersion(media.storageKey, media.sizeBytes),
      ),
      storageKey: media.storageKey,
      sizeBytes: media.sizeBytes,
      caption: media.caption,
      isCover: media.isCover,
    })),
    publicationTier:
      (row.publication.publicationTier as GrupoOlxPublicationTier | null) ?? 'STANDARD',
  };
}

export async function loadAgency(
  db: AppDb,
  orgId: string,
): Promise<VrsyncAgency & { status: string }> {
  const [org] = await db
    .select({
      name: organizations.name,
      email: organizations.publicContactEmail,
      phone: organizations.phone,
      status: organizations.status,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    throw new Error(`organização ${orgId} não encontrada`);
  }
  return org;
}

export interface LoadFeedRowsOptions {
  /** Cursor: só anúncios com id maior (ordem estável para paginar o arquivo). */
  afterListingId?: string;
  limit?: number;
  /** Só estes anúncios (avaliação de um anúncio, relatório). */
  listingIds?: readonly string[];
  /** Só publicações nestes estados. */
  statuses?: readonly string[];
}

/**
 * Lê as publicações do Grupo OLX com tudo o que o feed precisa, em lote: uma consulta por tabela por
 * página, nunca uma por anúncio.
 */
export async function loadFeedRows(
  db: AppDb,
  orgId: string,
  options: LoadFeedRowsOptions = {},
): Promise<FeedRow[]> {
  const conditions = [
    eq(listingChannelPublications.orgId, orgId),
    eq(listingChannelPublications.channel, GRUPO_OLX_CHANNEL),
  ];
  if (options.afterListingId) {
    conditions.push(gt(listingChannelPublications.listingId, options.afterListingId));
  }
  if (options.listingIds) {
    if (options.listingIds.length === 0) return [];
    conditions.push(inArray(listingChannelPublications.listingId, [...options.listingIds]));
  }
  if (options.statuses) {
    conditions.push(inArray(listingChannelPublications.status, [...options.statuses]));
  }
  const base = await db
    .select({ publication: listingChannelPublications, listing: listings, property: properties })
    .from(listingChannelPublications)
    .innerJoin(
      listings,
      and(
        eq(listings.id, listingChannelPublications.listingId),
        eq(listings.orgId, listingChannelPublications.orgId),
      ),
    )
    .innerJoin(
      properties,
      and(eq(properties.id, listings.propertyId), eq(properties.orgId, listings.orgId)),
    )
    .where(and(...conditions))
    .orderBy(asc(listingChannelPublications.listingId))
    .limit(options.limit ?? FEED_PAGE_SIZE);
  if (base.length === 0) {
    return [];
  }

  const propertyIds = [...new Set(base.map((row) => row.property.id))];
  const [terms, addresses, features, media] = await Promise.all([
    db
      .select()
      .from(propertyFinancialTerms)
      .where(inArray(propertyFinancialTerms.propertyId, propertyIds)),
    db.select().from(propertyAddresses).where(inArray(propertyAddresses.propertyId, propertyIds)),
    db
      .select({ propertyId: propertyFeatures.propertyId, feature: propertyFeatures.feature })
      .from(propertyFeatures)
      .where(inArray(propertyFeatures.propertyId, propertyIds))
      .orderBy(asc(propertyFeatures.createdAt)),
    db
      .select()
      .from(propertyMedia)
      .where(
        and(
          inArray(propertyMedia.propertyId, propertyIds),
          eq(propertyMedia.kind, 'PHOTO'),
          eq(propertyMedia.isPublic, true),
        ),
      )
      .orderBy(asc(propertyMedia.sortOrder), asc(propertyMedia.createdAt)),
  ]);

  const termsBy = new Map(terms.map((row) => [row.propertyId, row]));
  const featuresBy = new Map<string, string[]>();
  for (const row of features) {
    featuresBy.set(row.propertyId, [...(featuresBy.get(row.propertyId) ?? []), row.feature]);
  }
  const privateBy = new Map<string, AddressRow>();
  const publicBy = new Map<string, AddressRow>();
  for (const row of addresses) {
    (row.isPublic ? publicBy : privateBy).set(row.propertyId, row);
  }
  const mediaBy = new Map<string, MediaRow[]>();
  for (const row of media) {
    mediaBy.set(row.propertyId, [...(mediaBy.get(row.propertyId) ?? []), row]);
  }

  return base.map(({ publication, listing, property }) => ({
    publication,
    listing,
    property,
    terms: termsBy.get(property.id) ?? null,
    privateAddress: privateBy.get(property.id) ?? null,
    publicAddress: publicBy.get(property.id) ?? null,
    features: featuresBy.get(property.id) ?? [],
    photos: mediaBy.get(property.id) ?? [],
  }));
}
