import type { MetadataRoute } from 'next';
import { buscarSitemap } from '@/lib/api';
import { urlAbsoluta } from '@/lib/seo';

/**
 * Renderizada a cada requisição, de propósito: esta rota escreve **URL
 * absoluta** (canônica, sitemap, JSON-LD), e o endereço do portal vem do
 * ambiente do contêiner. Se a rota for gerada no `next build`, o endereço é
 * assado com o padrão de desenvolvimento e vai para produção como
 * `http://localhost:3100` — foi o que aconteceu na primeira implantação em
 * `achouimovel.online`. O custo é baixo: a chamada à API continua em cache por
 * tag (`src/lib/api.ts`).
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
