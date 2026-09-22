import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Recuperar senha | Aluguei.app' };

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>Aluguei.app</strong>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
