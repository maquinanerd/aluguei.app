import type { MetadataRoute } from 'next';
import { baseUrl } from '@/lib/seo';

/**
 * Rota (não página) que roda a cada requisição, de propósito. Dois motivos:
 * o conteúdo depende do que a API tem agora, e o endereço público do portal vem
 * do ambiente do contêiner. O critério "nenhum force-dynamic" do prompt vale para
 * as páginas públicas, que continuam geradas no build — o endereço delas chega
 * pelo `ARG PORTAL_BASE_URL` do Dockerfile.
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
