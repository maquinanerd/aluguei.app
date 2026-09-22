'use client';

import { useState } from 'react';
import { Badge, Button, Card, Group, Input, Stack, ToastProvider, useToast } from '@aluguei/ui';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { changePasswordErrors, revokedSessionsText } from '@/lib/account-rules';
import type { FieldErrors } from '@/lib/account-rules';
import { useQuery } from '@/lib/use-query';
import { ROLE_LABELS } from '@/lib/labels';

interface Membership {
  id: string;
  orgId: string;
  role: string;
  createdAt: string;
}

function SettingsBody() {
  const membershipsQ = useQuery<{ memberships: Membership[] }>('/me/memberships', []);

  if (membershipsQ.permissionDenied)
    return <PermissionDenied title="Sem acesso às configurações" />;

  return (
    <div className="app-page">
      <PageToolbar title="Configurações" description="Preferências e funções da sua conta." />

      <div className="peg-grid cols-2" style={{ alignItems: 'start' }}>
        <ChangePasswordCard />

        <Card title="Minhas organizações" padless>
          <Stack gap={2} style={{ padding: 16 }}>
            {(membershipsQ.data?.memberships ?? []).map((m) => (
              <Group
                key={m.id}
                between
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--peg-border)',
                  borderRadius: 'var(--peg-radius-sm)',
                }}
              >
                <span className="peg-text-mono peg-text-tertiary" style={{ fontSize: 12 }}>
                  {m.orgId.slice(0, 8)}
                </span>
                <Badge tone={m.role === 'owner' || m.role === 'admin' ? 'brand' : 'neutral'}>
                  {ROLE_LABELS[m.role] ?? m.role}
                </Badge>
              </Group>
            ))}
            {(membershipsQ.data?.memberships ?? []).length === 0 ? (
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Nenhuma organização.
              </span>
            ) : null}
          </Stack>
        </Card>

        <Card title="Sobre o painel" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            <p style={{ fontSize: 13, lineHeight: '20px', color: 'var(--peg-text-secondary)' }}>
              Painel administrativo do Aluguei.app construído sobre o PEG Product Design System.
            </p>
            <Group gap={2}>
              <Badge tone="info">dry-run</Badge>
              <Badge tone="neutral">sandbox</Badge>
            </Group>
          </Stack>
        </Card>
      </div>
    </div>
  );
}

/**
 * Troca de senha pela conta (auditoria 2026-09-10, P2-04): exige a senha atual e encerra as outras
 * sessões — a desta tela continua.
 */
function ChangePasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'current' | 'password' | 'confirm'>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setServerError(null);
    const found = changePasswordErrors({ current, password, confirm });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const res = await apiClient<{ ok: true; revokedSessions: number }>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: password },
      });
      toast.success('Senha alterada', revokedSessionsText(res.revokedSessions));
      setCurrent('');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Falha ao trocar a senha');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Trocar senha" padless>
      <form
        className="peg-stack"
        style={{ gap: 12, padding: 16 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {serverError ? (
          <span className="peg-field__error" role="alert">
            {serverError}
          </span>
        ) : null}
        <Input
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
          }}
          {...(errors.current ? { error: errors.current } : {})}
        />
        <Input
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          helper="De 8 a 128 caracteres."
          {...(errors.password ? { error: errors.password } : {})}
        />
        <Input
          label="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
          {...(errors.confirm ? { error: errors.confirm } : {})}
        />
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          As outras sessões abertas com esta conta são encerradas.
        </span>
        <div>
          <Button variant="primary" type="submit" loading={busy}>
            Trocar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SettingsClient() {
  return (
    <ToastProvider>
      <SettingsBody />
    </ToastProvider>
  );
}
