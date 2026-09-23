import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  listings,
  organizations,
  properties,
  propertyAddresses,
  propertyFinancialTerms,
  propertyMedia,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { pricePerSquareMeterCents } from '@aluguei/domain';
import type { PublicListingCard } from '@aluguei/contracts';

/**
 * Leitura compartilhada do portal: a busca, a página do anúncio e o sitemap
 * montam o mesmo card, com as mesmas regras de privacidade. Em um lugar só, para
 * não existir uma rota pública que esquece de esconder o endereço.
 */

/** Teto de linhas lidas por consulta pública (estatística e listagem). */
export const MAX_SAMPLE = 1000;

export type PublicPurpose = 'RENT' | 'SALE';

/** Imóvel `BOTH` entra nas duas buscas. */
export function purposeIn(purpose: PublicPurpose): SQL {
  return inArray(properties.purpose, purpose === 'SALE' ? ['SALE', 'BOTH'] : ['RENT', 'BOTH']);
}

/** Aluguel soma os encargos: é o valor total do mês que o card mostra. */
export function totalMonthlyCents(
  rent: number | null,
  condo: number | null,
  iptu: number | null,
): number | null {
  if (rent === null) {
    return null;
  }
  return rent + (condo ?? 0) + (iptu ?? 0);
}

interface Valores {
  monthlyRentCents: number | null;
  condoFeeCents: number | null;
  iptuCents: number | null;
  salePriceCents: number | null;
}

/** O valor que ordena e vira estatística: total do mês no aluguel, preço na venda. */
export function priceOf(purpose: PublicPurpose, row: Valores): number | null {
  return purpose === 'SALE'
    ? row.salePriceCents
    : totalMonthlyCents(row.monthlyRentCents, row.condoFeeCents, row.iptuCents);
}

export interface LoadCardsOptions {
  limit?: number;
  /** Falso quando a rota precisa ver também o anúncio fora do ar (410 e 301). */
  onlyPublished?: boolean;
}

export async function loadCards(db: AppDb, where: SQL[], options: LoadCardsOptions = {}) {
  const { limit = MAX_SAMPLE, onlyPublished = true } = options;
  const condicoes: SQL[] = [
    eq(propertyAddresses.isPublic, true),
    eq(properties.status, 'ACTIVE'),
    ...where,
  ];
  if (onlyPublished) {
    condicoes.push(
      eq(listings.status, 'PUBLISHED'),
      eq(organizations.status, 'ACTIVE'),
      isNotNull(listings.publishedAt),
    );
  }

  return db
    .select({
      id: listings.id,
      slug: listings.publicSlug,
      title: listings.title,
      description: listings.description,
      listingStatus: listings.status,
      publishedAt: listings.publishedAt,
      updatedAt: listings.updatedAt,
      orgId: listings.orgId,
      purpose: properties.purpose,
      propertyType: properties.propertyType,
      propertyId: properties.id,
      bedrooms: properties.bedrooms,
      bathrooms: properties.bathrooms,
      parkingSpots: properties.parkingSpots,
      totalAreaSqm: properties.totalAreaSqm,
      builtAreaSqm: properties.builtAreaSqm,
      neighborhood: propertyAddresses.neighborhood,
      neighborhoodSlug: propertyAddresses.neighborhoodSlug,
      city: propertyAddresses.city,
      citySlug: propertyAddresses.citySlug,
      state: propertyAddresses.state,
      monthlyRentCents: propertyFinancialTerms.monthlyRentCents,
      condoFeeCents: propertyFinancialTerms.condoFeeCents,
      iptuCents: propertyFinancialTerms.iptuCents,
      salePriceCents: propertyFinancialTerms.salePriceCents,
      orgSlug: organizations.slug,
      orgName: organizations.name,
      orgCreci: organizations.creci,
      orgStatus: organizations.status,
    })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .innerJoin(organizations, eq(organizations.id, listings.orgId))
    .innerJoin(propertyAddresses, eq(propertyAddresses.propertyId, properties.id))
    .leftJoin(propertyFinancialTerms, eq(propertyFinancialTerms.propertyId, properties.id))
    .where(and(...condicoes))
    .limit(limit);
}

export type PublicRow = Awaited<ReturnType<typeof loadCards>>[number];

export interface PublicPhotoRow {
  id: string;
  propertyId: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
}

/** Fotos públicas dos imóveis, já na ordem da galeria (capa primeiro). */
export async function photosOf(db: AppDb, propertyIds: string[]): Promise<PublicPhotoRow[]> {
  if (propertyIds.length === 0) {
    return [];
  }
  const fotos = await db
    .select({
      id: propertyMedia.id,
      propertyId: propertyMedia.propertyId,
      caption: propertyMedia.caption,
      sortOrder: propertyMedia.sortOrder,
      isCover: propertyMedia.isCover,
    })
    .from(propertyMedia)
    .where(
      and(
        inArray(propertyMedia.propertyId, propertyIds),
        eq(propertyMedia.isPublic, true),
        eq(propertyMedia.kind, 'PHOTO'),
      ),
    );
  return fotos.sort((a, b) => {
    if (a.isCover !== b.isCover) {
      return a.isCover ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Linha do banco → card público. Aqui é onde o endereço exato, a coordenada e a
 * chave de storage ficam de fora: a foto sai como caminho do próprio portal.
 */
export function listingCardFrom(row: PublicRow, photos: PublicPhotoRow[]): PublicListingCard {
  const doImovel = photos.filter((foto) => foto.propertyId === row.propertyId);
  const capa = doImovel[0];
  const area = row.builtAreaSqm ?? row.totalAreaSqm;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    purpose: row.purpose as PublicListingCard['purpose'],
    propertyType: row.propertyType as PublicListingCard['propertyType'],
    neighborhood: row.neighborhood,
    neighborhoodSlug: row.neighborhoodSlug,
    city: row.city,
    citySlug: row.citySlug,
    state: row.state,
    monthlyRentCents: row.monthlyRentCents,
    condoFeeCents: row.condoFeeCents,
    iptuCents: row.iptuCents,
    totalMonthlyCents: totalMonthlyCents(row.monthlyRentCents, row.condoFeeCents, row.iptuCents),
    salePriceCents: row.salePriceCents,
    pricePerSqmCents: pricePerSquareMeterCents(row.salePriceCents, area),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    parkingSpots: row.parkingSpots,
    areaSqm: area,
    photoCount: doImovel.length,
    coverPath: capa ? `/public/media/${capa.id}` : null,
    coverCaption: capa?.caption ?? null,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    org: { slug: row.orgSlug, name: row.orgName, creci: row.orgCreci },
  };
}
