'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function doLogin(form: FormData): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Falha no login';
        setError(message);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: { preventDefault(): void; currentTarget: HTMLFormElement }): void {
    event.preventDefault();
    void doLogin(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h1>Entrar no Aluguei.app</h1>
      {error ? (
        <p className="error" role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}
      <label htmlFor="login-email">E-mail</label>
      <input
        id="login-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        aria-describedby={error ? 'login-error' : undefined}
      />
      <label htmlFor="login-password">Senha</label>
      <input
        id="login-password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-describedby={error ? 'login-error' : undefined}
      />
      <button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'Entrando…' : 'Entrar'}
      </button>
      <p>
        Ainda não tem conta? <a href="/register">Criar conta</a>
      </p>
    </form>
  );
}
