import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>{BRAND.name}</strong>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
