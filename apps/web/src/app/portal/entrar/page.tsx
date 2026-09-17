import type { Metadata } from 'next';
import { PortalEntry } from './portal-entry';

// O token do link não pode vazar no cabeçalho Referer de nenhuma requisição da página.
export const metadata: Metadata = {
  title: 'Entrar no portal | Aluguei.app',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function PortalEntryPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>Aluguei.app</strong>
        </div>
        <PortalEntry />
      </section>
    </main>
  );
}
