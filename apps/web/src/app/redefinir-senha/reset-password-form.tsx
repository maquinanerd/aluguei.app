'use client';

import { useState } from 'react';
import { Button, Icon, Input } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { newPasswordErrors } from '@/lib/account-rules';
import type { FieldErrors } from '@/lib/account-rules';

/**
 * Redefinição de senha pelo link de uso único (auditoria 2026-09-10, P2-04). Ao salvar, todas as
 * sessões abertas da conta são encerradas.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'password' | 'confirm'>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setServerError(null);
    const found = newPasswordErrors({ password, confirm });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await apiClient('/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: password },
      });
      setDone(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Falha ao redefinir a senha');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="peg-stack" style={{ gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>Redefinir senha</h1>
        <p style={{ fontSize: 13, color: 'var(--peg-text-secondary)' }}>
          Este endereço não tem o link de redefinição.{' '}
          <a href="/esqueci-senha" style={{ fontWeight: 500 }}>
            Pedir um link novo
          </a>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="peg-stack" style={{ gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>Redefinir senha</h1>
        <div
          role="status"
          className="peg-group"
          style={{
            gap: 8,
            padding: '8px 12px',
            background: 'var(--peg-success-bg)',
            borderRadius: 'var(--peg-radius-sm)',
          }}
        >
          <Icon name="checkCircle" size={16} />
          <span style={{ fontSize: 13 }}>
            Senha redefinida. As sessões abertas com a senha antiga foram encerradas.
          </span>
        </div>
        <a href="/login" className="peg-btn peg-btn--primary" style={{ textAlign: 'center' }}>
          Entrar
        </a>
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
      <h1 style={{ fontSize: 20 }}>Redefinir senha</h1>
      {serverError ? (
        <div
          role="alert"
          className="peg-group"
          style={{
            gap: 8,
            padding: '8px 12px',
            background: 'var(--peg-danger-bg)',
            borderRadius: 'var(--peg-radius-sm)',
          }}
        >
          <Icon name="alertCircle" size={16} />
          <span style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
            {serverError}.{' '}
            <a href="/esqueci-senha" style={{ fontWeight: 500 }}>
              Pedir um link novo
            </a>
          </span>
        </div>
      ) : null}
      <Input
        id="reset-password"
        type="password"
        autoComplete="new-password"
        label="Nova senha"
        helper="De 8 a 128 caracteres."
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
        {...(errors.password ? { error: errors.password } : {})}
      />
      <Input
        id="reset-password-confirm"
        type="password"
        autoComplete="new-password"
        label="Confirme a nova senha"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
        }}
        {...(errors.confirm ? { error: errors.confirm } : {})}
      />
      <Button type="submit" variant="primary" fullWidth loading={busy}>
        Salvar nova senha
      </Button>
    </form>
  );
}
