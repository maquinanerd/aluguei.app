'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  Group,
  Icon,
  Stack,
  Tabs,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, META_CAMPAIGN_STATUS_LABELS, META_CAMPAIGN_STATUS_TONES, META_AD_PROFILE_STATUS_LABELS, META_AD_PROFILE_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, EmptyState, ErrorState } from '@aluguei/ui';

interface Connection {
  id: string;
  status: string;
  scopes: string[];
  expiresAt: string | null;
  lastTestedAt: string | null;
  createdAt: string;
}

interface AdProfile {
  id: string;
  propertyId: string;
  listingId: string | null;
  name: string;
  objective: string;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  startAt: string | null;
  endAt: string | null;
  landingUrl: string;
  copyPrimary: string;
  status: string;
  createdAt: string;
}

interface Campaign {
  id: string;
  adProfileId: string;
  providerCampaignId: string;
  name: string;
  objective: string;
  status: string;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  startAt: string | null;
  endAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface Property {
  id: string;
  title: string;
}

interface Listing {
  id: string;
  title: string;
}

const CONNECTION_STATUS_LABELS: Record<string, string> = {
  CONNECTING: 'Conectando',
  ACTIVE: 'Ativa',
  EXPIRED: 'Expirada',
  REVOKED: 'Revogada',
};

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_LEADS: 'Leads',
  OUTCOME_ENGAGEMENT: 'Engajamento',
};

const TABS = [
  { value: 'visao-geral', label: 'Visão geral' },
  { value: 'campanhas', label: 'Campanhas' },
  { value: 'perfis', label: 'Perfis de anúncio' },
  { value: 'conexao', label: 'Conexão' },
];

function MarketingBody() {
  const toast = useToast();
  const [tab, setTab] = useState('visao-geral');
  const [confirmAction, setConfirmAction] = useState<{ kind: string; id: string; title: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const connQ = useQuery<{ connections: Connection[] }>('/meta/connections', []);
  const profilesQ = useQuery<{ adProfiles: AdProfile[]; total: number }>('/meta/ad-profiles?limit=100', []);
  const campaignsQ = useQuery<{ campaigns: Campaign[]; total: number }>('/meta/campaigns?limit=100', []);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', []);
  const listingsQ = useQuery<{ listings: Listing[]; total: number }>('/listings?limit=200', []);

  if (connQ.permissionDenied) return <PermissionDenied title="Sem acesso ao marketing" />;

  const connection = connQ.data?.connections[0] ?? null;
  const profiles = profilesQ.data?.adProfiles ?? [];
  const campaigns = campaignsQ.data?.campaigns ?? [];

  const propertyMap = useMemo(() => {
    const m = new Map<string, Property>();
    for (const p of propsQ.data?.properties ?? []) m.set(p.id, p);
    return m;
  }, [propsQ.data]);

  const listingMap = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const l of listingsQ.data?.listings ?? []) m.set(l.id, l);
    return m;
  }, [listingsQ.data]);

  async function connectFake() {
    setBusyKey('connect');
    try {
      await apiClient('/meta/connections', { method: 'POST', body: { provider: 'FAKE' } });
      toast.success('Conexão de teste criada', 'Modo dry-run (FAKE).');
      connQ.reload();
    } catch (err) {
      toast.error('Falha na conexão', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyKey(null);
    }
  }

  async function runAction(kind: string, id: string, title: string) {
    const key = `${kind}:${id}`;
    setBusyKey(key);
    try {
      await apiClient(`/meta/campaigns/${id}/${kind}`, { method: 'POST', body: { idempotencyKey: `${kind}-${id}-${String(Date.now())}` } });
      toast.success('Ação executada', title);
      campaignsQ.reload();
    } catch (err) {
      toast.error('Falha na ação', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyKey(null);
      setConfirmAction(null);
    }
  }

  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
  const activeProfiles = profiles.filter((p) => p.status === 'PUBLISHED' || p.status === 'PREPARED');

  return (
    <div className="app-page">
      <PageToolbar
        title="Marketing"
        description="Anúncios Meta para imóveis (Housing Special Ad Category)."
        actions={
          connection ? (
            <Badge tone={connection.status === 'ACTIVE' ? 'success' : 'warning'}>{CONNECTION_STATUS_LABELS[connection.status] ?? connection.status}</Badge>
          ) : (
            <Button size="sm" variant="brand" loading={busyKey === 'connect'} onClick={() => { void connectFake(); }}>
              Conectar Meta (teste)
            </Button>
          )
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === 'visao-geral' ? (
        <div className="peg-grid cols-3">
          <Card title="Campanhas ativas" padless>
            <div style={{ padding: 16, fontSize: 22, fontWeight: 700 }}>{String(activeCampaigns.length)}</div>
            <div style={{ padding: '0 16px 16px', color: 'var(--peg-text-tertiary)', fontSize: 12 }}>
              {String(campaigns.length)} no total
            </div>
          </Card>
          <Card title="Perfis preparados" padless>
            <div style={{ padding: 16, fontSize: 22, fontWeight: 700 }}>{String(activeProfiles.length)}</div>
            <div style={{ padding: '0 16px 16px', color: 'var(--peg-text-tertiary)', fontSize: 12 }}>
              {String(profiles.length)} no total
            </div>
          </Card>
          <Card title="Modo de execução" padless>
            <div style={{ padding: 16 }}>
              <Badge tone="info">dry-run / sandbox</Badge>
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--peg-text-tertiary)' }}>
                Nenhuma campanha paga real é ativada sem intenção explícita do produto.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'campanhas' ? (
        <Card title="Campanhas" padless>
          {campaigns.length === 0 ? (
            <EmptyState
              title="Nenhuma campanha"
              body="Prepare um perfil de anúncio e crie a campanha para começar."
              icon="megaphone"
            />
          ) : (
            <Stack gap={0}>
              {campaigns.map((c) => (
                <Group key={c.id} gap={3} style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                      {OBJECTIVE_LABELS[c.objective] ?? c.objective} · {propertyMap.get(profiles.find((p) => p.id === c.adProfileId)?.propertyId ?? '')?.title ?? '—'}
                    </span>
                  </Stack>
                  <Badge tone={META_CAMPAIGN_STATUS_TONES[c.status] ?? 'neutral'}>{label(META_CAMPAIGN_STATUS_LABELS, c.status)}</Badge>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{formatBRL(c.dailyBudgetCents ?? c.lifetimeBudgetCents)}</span>
                  <Group gap={1}>
                    {c.status === 'CREATED_PAUSED' ? (
                      <Button size="xs" variant="brand" loading={busyKey === `publish:${c.id}`} onClick={() => { setConfirmAction({ kind: 'publish', id: c.id, title: `Publicar ${c.name}` }); }}>
                        Publicar
                      </Button>
                    ) : null}
                    {c.status === 'ACTIVE' ? (
                      <>
                        <Button size="xs" variant="secondary" loading={busyKey === `pause:${c.id}`} onClick={() => { setConfirmAction({ kind: 'pause', id: c.id, title: `Pausar ${c.name}` }); }}>
                          Pausar
                        </Button>
                        <Button size="xs" variant="tertiary" onClick={() => { void syncInsights(c.id); }}>
                          Insights
                        </Button>
                      </>
                    ) : null}
                    {c.status === 'PAUSED' ? (
                      <Button size="xs" variant="secondary" loading={busyKey === `resume:${c.id}`} onClick={() => { setConfirmAction({ kind: 'resume', id: c.id, title: `Retomar ${c.name}` }); }}>
                        Retomar
                      </Button>
                    ) : null}
                    {c.status !== 'ARCHIVED' ? (
                      <Button size="xs" variant="tertiary" onClick={() => { setConfirmAction({ kind: 'archive', id: c.id, title: `Arquivar ${c.name}` }); }}>
                        Arquivar
                      </Button>
                    ) : null}
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      ) : null}

      {tab === 'perfis' ? (
        <Card title="Perfis de anúncio" padless>
          {profiles.length === 0 ? (
            <EmptyState
              title="Nenhum perfil de anúncio"
              body="Perfis preparados por imóvel aparecerão aqui."
              icon="target"
            />
          ) : (
            <Stack gap={0}>
              {profiles.map((p) => (
                <Group key={p.id} gap={3} style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Icon name="target" size={14} />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                      {propertyMap.get(p.propertyId)?.title ?? '—'} · {listingMap.get(p.listingId ?? '')?.title ?? ''}
                    </span>
                  </Stack>
                  <Badge tone={META_AD_PROFILE_STATUS_TONES[p.status] ?? 'neutral'}>{label(META_AD_PROFILE_STATUS_LABELS, p.status)}</Badge>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{formatBRL(p.dailyBudgetCents ?? p.lifetimeBudgetCents)}</span>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      ) : null}

      {tab === 'conexao' ? (
        <Card title="Conexão Meta" padless>
          <Stack gap={4} style={{ padding: 20 }}>
            {connection ? (
              <Group gap={2}>
                <Badge tone={connection.status === 'ACTIVE' ? 'success' : 'warning'}>{CONNECTION_STATUS_LABELS[connection.status] ?? connection.status}</Badge>
                {connection.lastTestedAt ? <Badge tone="neutral">último teste {formatDate(connection.lastTestedAt)}</Badge> : null}
              </Group>
            ) : (
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>Nenhuma conexão registrada.</span>
            )}
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Escopos solicitados</span>
              <Group gap={2} wrap>
                {(connection?.scopes ?? []).map((s) => (
                  <Badge key={s} tone="neutral">{s}</Badge>
                ))}
                {(connection?.scopes ?? []).length === 0 ? <span className="peg-text-tertiary" style={{ fontSize: 13 }}>—</span> : null}
              </Group>
            </Stack>
            <Group gap={2}>
              <Button size="sm" variant="secondary" onClick={() => { void connectFake(); }} loading={busyKey === 'connect'}>
                Reconectar (teste)
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : null}

      {connQ.error || campaignsQ.error ? (
        <ErrorState body={connQ.error ?? campaignsQ.error ?? 'Falha ao carregar'} onRetry={() => { connQ.reload(); campaignsQ.reload(); }} />
      ) : null}

      <ConfirmModal
        open={confirmAction !== null}
        onClose={() => { setConfirmAction(null); }}
        onConfirm={() => { if (confirmAction) void runAction(confirmAction.kind, confirmAction.id, confirmAction.title); }}
        title={confirmAction?.title ?? 'Confirmar ação'}
        body="Esta ação afeta a campanha no Meta (sandbox em desenvolvimento). A operação é auditada."
        confirmLabel={confirmAction?.kind === 'archive' ? 'Arquivar' : confirmAction?.kind === 'publish' ? 'Publicar' : 'Confirmar'}
        loading={busyKey !== null}
      />
    </div>
  );
}

async function syncInsights(id: string) {
  await apiClient(`/meta/campaigns/${id}/sync-insights`, { method: 'POST', body: {} });
}

export function MarketingClient() {
  return (
    <ToastProvider>
      <MarketingBody />
    </ToastProvider>
  );
}
