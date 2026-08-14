import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Criar conta | Aluguei.app' };

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="app-sidebar__logo">A</span>
          <strong>Aluguei.app</strong>
        </div>
        <RegisterForm />
      </section>
    </main>
  );
}
