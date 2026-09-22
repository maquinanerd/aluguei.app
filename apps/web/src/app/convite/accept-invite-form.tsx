'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Icon, Input } from '@aluguei/ui';
import { formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { newPasswordErrors } from '@/lib/account-rules';
import type { FieldErrors } from '@/lib/account-rules';
import { label, ROLE_LABELS } from '@/lib/labels';

interface InviteView {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
}

/**
 * Aceite do convite de membro (auditoria 2026-09-10, P2-04). Sem conta, a pessoa escolhe o nome e
 * a senha e entra no painel; com conta, só ganha o vínculo — a senha dela não muda e ela entra pelo
 * login. O token vai no corpo da chamada, nunca na URL da API.
 */
export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'name' | 'password' | 'confirm'>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    apiClient<{ invite: InviteView }>('/invites/describe', { method: 'POST', body: { token } })
      .then((res) => {
        if (!cancelled) setInvite(res.invite);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Convite inválido ou expirado');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setServerError(null);
    const found: FieldErrors<'name' | 'password' | 'confirm'> = {
      ...newPasswordErrors({ password, confirm }),
    };
    if (!name.trim()) found.name = 'Informe o seu nome';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const res = await apiClient<{ created: boolean }>('/invites/accept', {
        method: 'POST',
        body: { token, name: name.trim(), password },
      });
      if (res.created) {
        router.push('/app');
        router.refresh();
        return;
      }
      setLinked(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Falha ao aceitar o convite');
    } finally {
      setBusy(false);
    }
  }

  const problem = token ? loadError : 'Este endereço não tem o convite.';
  if (problem) {
    return (
      <div className="peg-stack" style={{ gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>Convite para a equipe</h1>
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
          <span style={{ fontSize: 13, color: 'var(--peg-danger)' }}>{problem}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
          Peça um convite novo a quem administra a equipe.{' '}
          <a href="/login" style={{ fontWeight: 500 }}>
            Ir para o login
          </a>
        </p>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="peg-stack" style={{ gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>Convite para a equipe</h1>
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          Carregando convite…
        </span>
      </div>
    );
  }

  if (linked) {
    return (
      <div className="peg-stack" style={{ gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>Convite para a equipe</h1>
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
            Vínculo criado com {invite.organizationName}. Entre com a senha que você já usa.
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
      <h1 style={{ fontSize: 20 }}>Convite para a equipe</h1>
      <div className="peg-stack" style={{ gap: 4 }}>
        <strong style={{ fontSize: 15 }}>{invite.organizationName}</strong>
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          {invite.email} · função <Badge tone="brand">{label(ROLE_LABELS, invite.role)}</Badge>
        </span>
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Válido até {formatDateTime(invite.expiresAt)}. Se você já tem conta com este e-mail, o
          vínculo é criado e a sua senha não muda.
        </span>
      </div>
      {serverError ? (
        <span className="peg-field__error" role="alert">
          {serverError}
        </span>
      ) : null}
      <Input
        id="invite-name"
        label="Seu nome"
        autoComplete="name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        {...(errors.name ? { error: errors.name } : {})}
      />
      <Input
        id="invite-password"
        type="password"
        autoComplete="new-password"
        label="Senha"
        helper="De 8 a 128 caracteres."
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
        {...(errors.password ? { error: errors.password } : {})}
      />
      <Input
        id="invite-password-confirm"
        type="password"
        autoComplete="new-password"
        label="Confirme a senha"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
        }}
        {...(errors.confirm ? { error: errors.confirm } : {})}
      />
      <Button type="submit" variant="primary" fullWidth loading={busy}>
        Aceitar convite
      </Button>
    </form>
  );
}
