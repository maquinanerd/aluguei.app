'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function doLogin(form: FormData): Promise<void> {
    setError(null);
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
  }

  function handleSubmit(event: { preventDefault(): void; currentTarget: HTMLFormElement }): void {
    event.preventDefault();
    void doLogin(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h1>Entrar no Aluguei.app</h1>
      {error ? <p className="error">{error}</p> : null}
      <label>
        E-mail
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Senha
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button type="submit">Entrar</button>
      <p>
        Ainda não tem conta? <a href="/register">Criar conta</a>
      </p>
    </form>
  );
}
