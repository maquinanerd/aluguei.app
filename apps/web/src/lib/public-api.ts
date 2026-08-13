import type { PublicListing } from '@aluguei/contracts';

export function publicApiBase(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:4000';
}

export function publicOrgSlug(): string | undefined {
  const slug = process.env.PUBLIC_ORG_SLUG;
  return slug && slug.length > 0 ? slug : undefined;
}

/** Fetch público (sem cookie) para o site de imóveis. Nunca falha: erros → lista vazia. */
export async function publicApiFetch<T = unknown>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${publicApiBase()}${path}`, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface PublicListingsResponse {
  listings: PublicListing[];
  total: number;
}

export async function fetchPublicListings(): Promise<PublicListingsResponse> {
  const slug = publicOrgSlug();
  if (!slug) {
    return { listings: [], total: 0 };
  }
  const data = await publicApiFetch<PublicListingsResponse>(
    `/public/organizations/${encodeURIComponent(slug)}/listings?limit=50`,
  );
  return data ?? { listings: [], total: 0 };
}

export async function fetchPublicListing(slug: string): Promise<PublicListing | null> {
  const orgSlug = publicOrgSlug();
  if (!orgSlug) {
    return null;
  }
  return publicApiFetch<PublicListing>(
    `/public/organizations/${encodeURIComponent(orgSlug)}/listings/${encodeURIComponent(slug)}`,
  );
}

export function formatBRL(cents: number | null): string {
  if (cents === null) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
