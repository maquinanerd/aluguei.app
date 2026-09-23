import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Redefinir senha' };

export default async function ResetPasswordPage({
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
        <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
      </section>
    </main>
  );
}
