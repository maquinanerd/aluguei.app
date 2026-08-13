'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function doRegister(form: FormData): Promise<void> {
    setError(null);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        organizationName: form.get('organizationName'),
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
          : 'Falha no cadastro';
      setError(message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  function handleSubmit(event: { preventDefault(): void; currentTarget: HTMLFormElement }): void {
    event.preventDefault();
    void doRegister(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h1>Criar conta no Aluguei.app</h1>
      {error ? <p className="error">{error}</p> : null}
      <label>
        Nome
        <input name="name" required autoComplete="name" />
      </label>
      <label>
        E-mail
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Senha (mínimo 8 caracteres)
        <input name="password" type="password" minLength={8} required autoComplete="new-password" />
      </label>
      <label>
        Nome da imobiliária
        <input name="organizationName" required />
      </label>
      <button type="submit">Criar conta</button>
      <p>
        Já tem conta? <a href="/login">Entrar</a>
      </p>
    </form>
  );
}
