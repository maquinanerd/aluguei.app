import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '@/styles/tokens.css';
import '@/styles/portal.css';
import '@/styles/telas.css';
import { baseUrl } from '@/lib/seo';

/**
 * Guton, a fonte do portal (a gestão continua na Inter). Os arquivos vieram da
 * entrega de design em `.otf`; converter para `woff2` é pendência registrada em
 * `docs/frontend/ACHOUIMOVEL_PLAN.md` (R8), junto da licença de uso.
 */
const guton = localFont({
  src: [
    { path: '../../public/fonts/Guton-Regular.otf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/Guton-Medium.otf', weight: '500', style: 'normal' },
    { path: '../../public/fonts/Guton-SemiBold.otf', weight: '600', style: 'normal' },
    { path: '../../public/fonts/Guton-Bold.otf', weight: '700', style: 'normal' },
    { path: '../../public/fonts/Guton-ExtraBold.otf', weight: '800', style: 'normal' },
    { path: '../../public/fonts/Guton-Black.otf', weight: '900', style: 'normal' },
  ],
  variable: '--font-guton',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AchouImóvel',
  description: 'Ache onde morar, em qualquer cidade do Brasil.',
};

/**
 * Organization e WebSite em todas as páginas: é o que amarra a marca como
 * entidade para o buscador. Sem razão social e CNPJ (pendência do dono), só o
 * nome e o endereço do site.
 */
function jsonLdDoSite(): Record<string, unknown> {
  const url = baseUrl();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${url}#organizacao`, name: 'AchouImóvel', url },
      {
        '@type': 'WebSite',
        '@id': `${url}#site`,
        name: 'AchouImóvel',
        url,
        inLanguage: 'pt-BR',
        publisher: { '@id': `${url}#organizacao` },
      },
    ],
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={guton.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdDoSite()) }}
        />
        {children}
      </body>
    </html>
  );
}
