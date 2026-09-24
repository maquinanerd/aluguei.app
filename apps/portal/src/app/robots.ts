import type { MetadataRoute } from 'next';
import { baseUrl } from '@/lib/seo';

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
