import type { Metadata } from 'next';
import { AcceptInviteForm } from './accept-invite-form';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Convite' };

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>{BRAND.name}</strong>
        </div>
        <AcceptInviteForm token={typeof token === 'string' ? token : ''} />
      </section>
    </main>
  );
}
