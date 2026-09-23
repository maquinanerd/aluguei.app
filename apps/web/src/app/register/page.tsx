import type { Metadata } from 'next';
import { RegisterForm } from './register-form';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Criar conta' };

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>{BRAND.name}</strong>
        </div>
        <RegisterForm />
      </section>
    </main>
  );
}
