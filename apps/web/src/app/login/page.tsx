import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>{BRAND.name}</strong>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
