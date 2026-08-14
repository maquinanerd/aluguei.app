'use client';

import {
  Badge,
  Card,
  Group,
  Stack,
  ToastProvider,
} from '@aluguei/ui';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied } from '@aluguei/ui';
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

  if (membershipsQ.permissionDenied) return <PermissionDenied title="Sem acesso às configurações" />;

  return (
    <div className="app-page">
      <PageToolbar title="Configurações" description="Preferências e funções da sua conta." />

      <div className="peg-grid cols-2" style={{ alignItems: 'start' }}>
        <Card title="Minhas organizações" padless>
          <Stack gap={2} style={{ padding: 16 }}>
            {(membershipsQ.data?.memberships ?? []).map((m) => (
              <Group key={m.id} between style={{ padding: '10px 12px', border: '1px solid var(--peg-border)', borderRadius: 'var(--peg-radius-sm)' }}>
                <span className="peg-text-mono peg-text-tertiary" style={{ fontSize: 12 }}>{m.orgId.slice(0, 8)}</span>
                <Badge tone={m.role === 'owner' || m.role === 'admin' ? 'brand' : 'neutral'}>{ROLE_LABELS[m.role] ?? m.role}</Badge>
              </Group>
            ))}
            {(membershipsQ.data?.memberships ?? []).length === 0 ? (
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>Nenhuma organização.</span>
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

export function SettingsClient() {
  return (
    <ToastProvider>
      <SettingsBody />
    </ToastProvider>
  );
}
