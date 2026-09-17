'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@aluguei/ui';
import { ACCOUNT_STATUS_PATH } from '@/lib/account-status';

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function doRegister(form: FormData): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
          organizationName: form.get('organizationName'),
          phone: form.get('phone'),
          document: form.get('document'),
          creci: form.get('creci'),
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
      // Cadastro aberto: a imobiliária só opera depois da aprovação da plataforma.
      router.push(ACCOUNT_STATUS_PATH);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="peg-stack"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        void doRegister(new FormData(e.currentTarget));
      }}
    >
      <h1 style={{ fontSize: 20 }}>Criar conta</h1>
      {error ? (
        <div
          className="peg-error"
          role="alert"
          style={{
            padding: '8px 12px',
            background: 'var(--peg-danger-bg)',
            borderRadius: 'var(--peg-radius-sm)',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--peg-danger)' }}>{error}</span>
        </div>
      ) : null}
      <Input
        name="name"
        required
        autoComplete="name"
        label="Nome"
        placeholder="Seu nome completo"
      />
      <Input
        name="email"
        type="email"
        required
        autoComplete="email"
        label="E-mail"
        placeholder="voce@imob.com.br"
      />
      <Input
        name="password"
        type="password"
        minLength={8}
        required
        autoComplete="new-password"
        label="Senha"
        helper="Mínimo de 8 caracteres"
      />
      <Input
        name="organizationName"
        required
        label="Nome da imobiliária"
        placeholder="Sua imobiliária"
      />
      <Input
        name="phone"
        type="tel"
        required
        autoComplete="tel"
        label="Telefone com DDD"
        placeholder="(11) 98765-4321"
      />
      <Input
        name="document"
        inputMode="numeric"
        label="CNPJ ou CPF"
        optional
        placeholder="00.000.000/0000-00"
      />
      <Input name="creci" label="CRECI" optional placeholder="J-00000" />
      <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
        O cadastro passa por análise da equipe do Aluguei.app antes de liberar o painel.
      </p>
      <Button type="submit" variant="primary" fullWidth loading={submitting}>
        Criar conta
      </Button>
      <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
        Já tem conta?{' '}
        <a href="/login" style={{ fontWeight: 500 }}>
          Entrar
        </a>
      </p>
    </form>
  );
}
