import type { Metadata } from 'next';
import Link from 'next/link';
import { Group } from '@aluguei/ui';

export const metadata: Metadata = {
  title: 'Aluguei.app',
  description: 'Plataforma de operação de locação residencial.',
};

export default function HomePage() {
  return (
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <span className="peg-group" style={{ gap: 8 }}>
          <span className="app-sidebar__logo">A</span>
          <strong style={{ fontSize: 15 }}>Aluguei.app</strong>
        </span>
        <span className="peg-spacer" />
        <Link href="/imoveis" style={{ fontSize: 13, fontWeight: 500 }}>
          Imóveis
        </Link>
        <Link href="/login" style={{ fontSize: 13, fontWeight: 500 }}>
          Entrar
        </Link>
        <Link href="/register" className="peg-btn peg-btn--brand peg-btn--sm">
          Começar grátis
        </Link>
      </nav>
      <main className="marketing-hero">
        <h1>O sistema operacional da locação imobiliária</h1>
        <p style={{ marginTop: 12, color: 'var(--peg-text-secondary)', fontSize: 16, lineHeight: '24px' }}>
          Do cadastro do imóvel ao repasse financeiro: leads, visitas, propostas,
          contratos, vistorias e cobranças em um só lugar.
        </p>
        <Group gap={3} style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link href="/register" className="peg-btn peg-btn--brand peg-btn--lg">
            Criar conta
          </Link>
          <Link href="/imoveis" className="peg-btn peg-btn--secondary peg-btn--lg">
            Ver imóveis
          </Link>
        </Group>
      </main>
    </div>
  );
}
