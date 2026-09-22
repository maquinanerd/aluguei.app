'use client';

import { useState } from 'react';
import { Button, Icon, Input } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { inviteErrors } from '@/lib/account-rules';

/**
 * Recuperação de senha (auditoria 2026-09-10, P2-04). A resposta é a mesma com ou sem conta, e a
 * mensagem vai para a caixa de saída local — nada é enviado por e-mail neste ambiente.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    // Mesma regra de e-mail do convite (formato), sem a função.
    const problem = inviteErrors({ email, role: 'viewer' }).email ?? null;
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await apiClient('/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao pedir o link');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="peg-stack" style={{ gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>Recuperar senha</h1>
        <div
          role="status"
          className="peg-group"
          style={{
            gap: 8,
            padding: '8px 12px',
            background: 'var(--peg-success-bg)',
            borderRadius: 'var(--peg-radius-sm)',
            alignItems: 'flex-start',
          }}
        >
          <Icon name="checkCircle" size={16} />
          <span style={{ fontSize: 13 }}>
            Se houver uma conta com este e-mail, registramos um link para redefinir a senha. Ele
            vale por 30 minutos e só pode ser usado uma vez.
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
          <a href="/login" style={{ fontWeight: 500 }}>
            Voltar para o login
          </a>
        </p>
      </div>
    );
  }

  return (
    <form
      className="peg-stack"
      style={{ gap: 16 }}
      noValidate
      onSubmit={(e) => {
        void submit(e);
      }}
    >
      <h1 style={{ fontSize: 20 }}>Recuperar senha</h1>
      <p style={{ fontSize: 13, color: 'var(--peg-text-secondary)' }}>
        Informe o e-mail da conta. Você recebe um link para escolher uma senha nova.
      </p>
      <Input
        id="forgot-email"
        type="email"
        autoComplete="email"
        label="E-mail"
        placeholder="voce@imob.com.br"
        autoFocus
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
        }}
        {...(error ? { error } : {})}
      />
      <Button type="submit" variant="primary" fullWidth loading={busy}>
        Enviar link
      </Button>
      <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
        Lembrou a senha?{' '}
        <a href="/login" style={{ fontWeight: 500 }}>
          Entrar
        </a>
      </p>
    </form>
  );
}
