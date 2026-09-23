import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import '@aluguei/ui/styles.css';
import './globals.css';
import { BRAND } from '@/lib/brand';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  // O sufixo do título sai daqui: as páginas declaram só o próprio nome.
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: 'Aluguel e venda de imóveis: anúncio, atendimento e contrato no mesmo lugar.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
