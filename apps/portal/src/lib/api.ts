import type {
  PublicSearchResponse,
  PublicListingDetail,
  PublicListingCard,
} from '@aluguei/contracts';

/**
 * Cliente do portal para a API pública. Tudo aqui roda no servidor: o navegador
 * nunca fala com a API direto, e a resposta entra no cache do Next por **tag**,
 * para publicar ou tirar um anúncio invalidar exatamente as páginas dele
 * (`docs/frontend/PORTAL_SEO.md`).
 */

export function apiBase(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:4000';
}

/**
 * Em produção a API precisa ser HTTPS, salvo quando é a própria rede interna
 * (`http://api:4000`) e isso foi dito de propósito — mesma regra do painel.
 */
export function assertSecureApiBase(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const base = process.env.API_BASE_URL;
  if (!base) {
    throw new Error('API_BASE_URL ausente em produção');
  }
  if (base.startsWith('https://')) {
    return;
  }
  if (process.env.API_BASE_URL_ALLOW_HTTP !== 'true') {
    throw new Error(
      'API_BASE_URL deve usar HTTPS em produção; para a API na rede interna (ex.: http://api:4000), defina API_BASE_URL_ALLOW_HTTP=true',
    );
  }
}

export class PortalApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'PortalApiError';
    this.status = status;
    this.body = body;
  }
}

export interface BuscaPublica {
  purpose: 'RENT' | 'SALE';
  city: string;
  neighborhood?: string | undefined;
  propertyType?: string | undefined;
  bedrooms?: number | undefined;
  maxPriceCents?: number | undefined;
  order?: 'RECENT' | 'PRICE_ASC' | 'PRICE_DESC' | undefined;
  page?: number | undefined;
}

/** Tag de cache de um recorte: publicar um anúncio invalida a cidade e o bairro dele. */
export function tagCidade(city: string): string {
  return `portal:cidade:${city}`;
}

export function tagBairro(city: string, neighborhood: string): string {
  return `portal:bairro:${city}:${neighborhood}`;
}

export function tagAnuncio(slug: string): string {
  return `portal:anuncio:${slug}`;
}

/** Quanto tempo o HTML fica válido sem nenhuma invalidação (rede de segurança). */
const REVALIDATE_SEGUNDOS = 600;

async function buscarJson<T>(caminho: string, tags: string[]): Promise<T> {
  assertSecureApiBase();
  const resposta = await fetch(`${apiBase()}${caminho}`, {
    headers: { accept: 'application/json' },
    next: { tags, revalidate: REVALIDATE_SEGUNDOS },
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new PortalApiError(resposta.status, `API respondeu ${String(resposta.status)}`, corpo);
  }
  return corpo as T;
}

export async function buscarImoveis(entrada: BuscaPublica): Promise<PublicSearchResponse> {
  const params = new URLSearchParams({ purpose: entrada.purpose, city: entrada.city });
  if (entrada.neighborhood !== undefined) {
    params.set('neighborhood', entrada.neighborhood);
  }
  if (entrada.propertyType !== undefined) {
    params.set('propertyType', entrada.propertyType);
  }
  if (entrada.bedrooms !== undefined) {
    params.set('bedrooms', String(entrada.bedrooms));
  }
  if (entrada.maxPriceCents !== undefined) {
    params.set('maxPriceCents', String(entrada.maxPriceCents));
  }
  if (entrada.order !== undefined) {
    params.set('order', entrada.order);
  }
  if (entrada.page !== undefined) {
    params.set('page', String(entrada.page));
  }

  const tags = [tagCidade(entrada.city)];
  if (entrada.neighborhood !== undefined) {
    tags.push(tagBairro(entrada.city, entrada.neighborhood));
  }
  return buscarJson<PublicSearchResponse>(`/public/search?${params.toString()}`, tags);
}

export type ResultadoAnuncio =
  | {
      tipo: 'ok';
      listing: PublicListingDetail;
      canonicalSlug: string;
      similar: PublicListingCard[];
    }
  | { tipo: 'movido'; canonicalSlug: string }
  | {
      tipo: 'removido';
      reason: 'UNPUBLISHED' | 'RENTED_OR_SOLD';
      neighborhood: string | null;
      city: string | null;
      similar: PublicListingCard[];
    }
  | { tipo: 'inexistente' };

/**
 * Anúncio pelo slug. O ciclo de vida da URL (ADR-099) vem da API e é traduzido
 * aqui em algo que a página sabe responder: 200, 301, 410 ou 404.
 */
export async function buscarAnuncio(slug: string): Promise<ResultadoAnuncio> {
  assertSecureApiBase();
  const resposta = await fetch(`${apiBase()}/public/listings/${encodeURIComponent(slug)}`, {
    headers: { accept: 'application/json' },
    redirect: 'manual',
    next: { tags: [tagAnuncio(slug)], revalidate: REVALIDATE_SEGUNDOS },
  });
  const corpo: unknown = await resposta.json().catch(() => null);

  if (resposta.status === 301) {
    const { canonicalSlug } = (corpo ?? {}) as { canonicalSlug?: string };
    return canonicalSlug === undefined
      ? { tipo: 'inexistente' }
      : { tipo: 'movido', canonicalSlug };
  }
  if (resposta.status === 410) {
    const removido = corpo as {
      reason: 'UNPUBLISHED' | 'RENTED_OR_SOLD';
      neighborhood: string | null;
      city: string | null;
      similar: PublicListingCard[];
    };
    return {
      tipo: 'removido',
      reason: removido.reason,
      neighborhood: removido.neighborhood,
      city: removido.city,
      similar: removido.similar,
    };
  }
  if (resposta.status === 404) {
    return { tipo: 'inexistente' };
  }
  if (!resposta.ok) {
    throw new PortalApiError(resposta.status, `API respondeu ${String(resposta.status)}`, corpo);
  }

  const ok = corpo as {
    listing: PublicListingDetail;
    canonicalSlug: string;
    similar: PublicListingCard[];
  };
  return { tipo: 'ok', listing: ok.listing, canonicalSlug: ok.canonicalSlug, similar: ok.similar };
}

export interface PaginaDoSitemap {
  path: string;
  count: number;
  lastmod: string;
}

export interface Sitemap {
  pages: PaginaDoSitemap[];
  listings: { path: string; lastmod: string }[];
  agencies: { path: string; lastmod: string }[];
}

export async function buscarSitemap(): Promise<Sitemap> {
  return buscarJson<Sitemap>('/public/sitemap', ['portal:sitemap']);
}

export interface ContatoDoAnuncio {
  name: string;
  phone?: string;
  email?: string;
  message?: string;
  consent: true;
}

/** Envia o contato do anúncio. Sem cache: é escrita. */
export async function enviarContato(
  slug: string,
  entrada: ContatoDoAnuncio,
): Promise<{ contactedBy: 'PHONE' | 'EMAIL' }> {
  assertSecureApiBase();
  const resposta = await fetch(`${apiBase()}/public/listings/${encodeURIComponent(slug)}/leads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(entrada),
    cache: 'no-store',
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new PortalApiError(resposta.status, `API respondeu ${String(resposta.status)}`, corpo);
  }
  return corpo as { contactedBy: 'PHONE' | 'EMAIL' };
}

export interface AlertaDeBusca {
  purpose: 'RENT' | 'SALE';
  city: string;
  neighborhood?: string;
  propertyType?: string;
  bedrooms?: number;
  maxPriceCents?: number;
  contactKind: 'EMAIL' | 'WHATSAPP';
  contactValue: string;
  consent: true;
}

export async function criarAlerta(entrada: AlertaDeBusca): Promise<{ status: string }> {
  assertSecureApiBase();
  const resposta = await fetch(`${apiBase()}/public/alerts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(entrada),
    cache: 'no-store',
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new PortalApiError(resposta.status, `API respondeu ${String(resposta.status)}`, corpo);
  }
  return corpo as { status: string };
}

export async function responderAlerta(
  acao: 'confirm' | 'cancel',
  token: string,
): Promise<{ status: string }> {
  assertSecureApiBase();
  const resposta = await fetch(`${apiBase()}/public/alerts/${acao}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new PortalApiError(resposta.status, `API respondeu ${String(resposta.status)}`, corpo);
  }
  return corpo as { status: string };
}
