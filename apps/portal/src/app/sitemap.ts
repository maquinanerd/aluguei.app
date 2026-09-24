import type { MetadataRoute } from 'next';
import { buscarSitemap } from '@/lib/api';
import { urlAbsoluta } from '@/lib/seo';

/**
 * Rota (não página) que roda a cada requisição, de propósito. Dois motivos:
 * o conteúdo depende do que a API tem agora, e o endereço público do portal vem
 * do ambiente do contêiner. O critério "nenhum force-dynamic" do prompt vale para
 * as páginas públicas, que continuam geradas no build — o endereço delas chega
 * pelo `ARG PORTAL_BASE_URL` do Dockerfile.
 */
export const dynamic = 'force-dynamic';

/**
 * Sitemap do portal. A lista vem da API, que já aplica o limiar de indexação
 * (ADR-099): recorte com menos de 3 anúncios e anúncio fora do ar não entram.
 * `lastmod` é a data real da última alteração, não a hora da geração.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dados = await buscarSitemap().catch(() => ({ pages: [], listings: [], agencies: [] }));

  const institucional: MetadataRoute.Sitemap = [
    { url: urlAbsoluta('/'), changeFrequency: 'daily', priority: 1 },
    { url: urlAbsoluta('/mapa-do-site'), changeFrequency: 'weekly', priority: 0.3 },
  ];

  return [
    ...institucional,
    ...dados.pages.map((pagina) => ({
      url: urlAbsoluta(pagina.path),
      lastModified: new Date(pagina.lastmod),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...dados.listings.map((anuncio) => ({
      url: urlAbsoluta(anuncio.path),
      lastModified: new Date(anuncio.lastmod),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...dados.agencies.map((vitrine) => ({
      url: urlAbsoluta(vitrine.path),
      lastModified: new Date(vitrine.lastmod),
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
  ];
}
