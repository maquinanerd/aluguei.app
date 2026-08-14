'use client';

import {
  Badge,
  Button,
  Card,
  Group,
  Icon,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { IconName } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied } from '@aluguei/ui';

interface Connection {
  id: string;
  status: string;
  scopes: string[];
  lastTestedAt: string | null;
  createdAt: string;
}

interface WaConnection {
  id: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  status: string;
  createdAt: string;
}

const CONN_LABELS: Record<string, string> = {
  CONNECTING: 'Conectando',
  ACTIVE: 'Ativa',
  EXPIRED: 'Expirada',
  REVOKED: 'Revogada',
};

interface IntegrationDef {
  key: string;
  name: string;
  description: string;
  icon: IconName;
  provider: 'meta' | 'whatsapp' | 'geocoding' | 'screening' | 'signature' | 'payments';
}

const INTEGRATIONS: IntegrationDef[] = [
  { key: 'meta', name: 'Meta Ads', description: 'Campanhas de anúncios para imóveis (Housing).', icon: 'megaphone', provider: 'meta' },
  { key: 'whatsapp', name: 'WhatsApp Business', description: 'Conversas e envio de mensagens.', icon: 'whatsapp', provider: 'whatsapp' },
  { key: 'geocoding', name: 'Google Maps', description: 'Geocodificação de endereços.', icon: 'mapPin', provider: 'geocoding' },
  { key: 'screening', name: 'Análise de crédito', description: 'Screening Serasa/SPC via adapter.', icon: 'shield', provider: 'screening' },
  { key: 'signature', name: 'Assinatura eletrônica', description: 'Envelopes Clicksign/D4Sign.', icon: 'gavel', provider: 'signature' },
  { key: 'payments', name: 'Pagamentos', description: 'Pix/boleto via gateway (Asaas).', icon: 'creditCard', provider: 'payments' },
];

function IntegrationsBody() {
  const toast = useToast();
  const metaQ = useQuery<{ connections: Connection[] }>('/meta/connections', []);
  const waQ = useQuery<{ connections: WaConnection[] }>('/whatsapp/connections', []);

  if (metaQ.permissionDenied) return <PermissionDenied title="Sem acesso às integrações" />;

  const metaConn = metaQ.data?.connections[0] ?? null;
  const waConn = waQ.data?.connections[0] ?? null;

  async function reconnect(kind: string) {
    try {
      if (kind === 'meta') {
        await apiClient('/meta/connections', { method: 'POST', body: { provider: 'FAKE' } });
        toast.success('Meta reconectada (teste)');
        metaQ.reload();
      } else if (kind === 'whatsapp') {
        await apiClient('/whatsapp/connections', { method: 'POST', body: { phoneNumberId: 'fake-phone-1' } });
        toast.success('WhatsApp conectado (teste)');
        waQ.reload();
      }
    } catch (err) {
      toast.error('Falha ao conectar', err instanceof Error ? err.message : undefined);
    }
  }

  function statusOf(def: IntegrationDef): { connected: boolean; label: string; detail?: string } {
    if (def.provider === 'meta') {
      if (!metaConn) return { connected: false, label: 'Desconectada' };
      const st: { connected: boolean; label: string; detail?: string } = {
        connected: metaConn.status === 'ACTIVE',
        label: CONN_LABELS[metaConn.status] ?? metaConn.status,
      };
      if (metaConn.lastTestedAt) st.detail = `último teste ${formatDate(metaConn.lastTestedAt)}`;
      return st;
    }
    if (def.provider === 'whatsapp') {
      if (!waConn) return { connected: false, label: 'Desconectada' };
      return { connected: waConn.status === 'ACTIVE', label: waConn.status === 'ACTIVE' ? 'Ativa' : 'Desativada', detail: waConn.phoneNumberId };
    }
    // Adapters com mock implícito (sem estado de conexão exposto): reportado como
    // "mock/dry-run" quando sem credencial externa (IMPLEMENTED_NOT_LIVE_VERIFIED).
    return { connected: false, label: 'Mock / dry-run', detail: 'Sem credencial externa — adapter implementado, não verificado ao vivo.' };
  }

  return (
    <div className="app-page">
      <PageToolbar title="Integrações" description="Status das conexões externas da operação." />

      <div className="peg-grid cols-2">
        {INTEGRATIONS.map((def) => {
          const st = statusOf(def);
          return (
            <Card key={def.key} title={def.name} padless>
              <Stack gap={3} style={{ padding: 20 }}>
                <Group gap={3}>
                  <Icon name={def.icon} size={22} />
                  <Stack gap={0} style={{ flex: 1 }}>
                    <span style={{ fontSize: 13 }}>{def.description}</span>
                    {st.detail ? <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{st.detail}</span> : null}
                  </Stack>
                </Group>
                <Group between>
                  <Badge tone={st.connected ? 'success' : 'neutral'}>{st.label}</Badge>
                  {(def.provider === 'meta' || def.provider === 'whatsapp') ? (
                    <Button size="xs" variant="secondary" icon={<Icon name="refresh" size={12} />} onClick={() => { void reconnect(def.provider); }}>
                      Conectar (teste)
                    </Button>
                  ) : null}
                </Group>
                <p className="peg-text-tertiary" style={{ fontSize: 11 }}>
                  Secrets nunca são exibidos. Estado real depende de credencial/homologação.
                </p>
              </Stack>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function IntegrationsClient() {
  return (
    <ToastProvider>
      <IntegrationsBody />
    </ToastProvider>
  );
}
