import type { MetadataRoute } from 'next';
import { baseUrl } from '@/lib/seo';

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
 * robots.txt do portal. O que decide indexação é a tag `robots` de cada página,
 * calculada pela contagem real (ADR-099); aqui ficam só as áreas que nunca
 * devem ser rastreadas e o endereço do sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // `/dev` é catálogo de componentes e nem responde em produção.
        disallow: ['/dev/', '/alerta/'],
      },
    ],
    sitemap: `${baseUrl()}/sitemap.xml`,
  };
}
