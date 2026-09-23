import type { Metadata } from 'next';
import { PortalEntry } from './portal-entry';
import { BRAND } from '@/lib/brand';

// O token do link não pode vazar no cabeçalho Referer de nenhuma requisição da página.
export const metadata: Metadata = {
  title: 'Entrar no portal',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function PortalEntryPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>{BRAND.name}</strong>
        </div>
        <PortalEntry />
      </section>
    </main>
  );
}
