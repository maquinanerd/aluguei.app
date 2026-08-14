'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Icon } from '@aluguei/ui';

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
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
            ? data.message
            : 'Falha no login';
        setError(message);
        return;
      }
      router.push('/app');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); void doLogin(new FormData(e.currentTarget)); }}>
      <h1 style={{ fontSize: 20 }}>Entrar</h1>
      {error ? (
        <div className="peg-error" role="alert" style={{ padding: '8px 12px', background: 'var(--peg-danger-bg)', borderRadius: 'var(--peg-radius-sm)', flexDirection: 'row', gap: 8 }}>
          <Icon name="alertCircle" size={16} />
          <span style={{ fontSize: 13, color: 'var(--peg-danger)' }}>{error}</span>
        </div>
      ) : null}
      <Input id="login-email" name="email" type="email" required autoComplete="email" label="E-mail" placeholder="voce@imob.com.br" autoFocus />
      <Input id="login-password" name="password" type="password" required autoComplete="current-password" label="Senha" placeholder="••••••••" />
      <Button type="submit" variant="primary" fullWidth loading={submitting}>
        Entrar
      </Button>
      <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
        Ainda não tem conta?{' '}
        <a href="/register" style={{ fontWeight: 500 }}>
          Criar conta
        </a>
      </p>
    </form>
  );
}
