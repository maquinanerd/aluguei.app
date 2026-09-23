import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '@/styles/tokens.css';
import '@/styles/portal.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={guton.variable}>
      <body>{children}</body>
    </html>
  );
}
