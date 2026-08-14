'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Icon,
  Stack,
  Tag,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, CHANNEL_STATUS_LABELS, CHANNEL_STATUS_TONES, CHANNEL_TYPE_LABELS } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, EmptyState, ErrorState } from '@aluguei/ui';

interface ChannelSummary {
  channels: Array<{
    channel: string;
    total: number;
    published: number;
    pending: number;
    failed: number;
    removed: number;
  }>;
  listings: Array<{
    listingId: string;
    title: string;
    channels: Array<{ channel: string; status: string; lastError: string | null }>;
  }>;
}

const ALL_CHANNELS = ['fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb'];

function ChannelsBody() {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data, loading, error, permissionDenied, reload } = useQuery<ChannelSummary>('/channels/summary', []);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a canais" />;

  const channelStats = useMemo(() => {
    const map = new Map<string, { total: number; published: number; pending: number; failed: number; removed: number }>();
    for (const ch of data?.channels ?? []) {
      map.set(ch.channel, {
        total: ch.total,
        published: ch.published,
        pending: ch.pending,
        failed: ch.failed,
        removed: ch.removed,
      });
    }
    return map;
  }, [data]);

  async function action(kind: 'publish' | 'remove' | 'reconcile' | 'importLeads', listingId: string | null, channel: string) {
    const key = `${kind}:${listingId ?? 'org'}:${channel}`;
    setBusyKey(key);
    try {
      const listing = listingId ?? '';
      if (kind === 'publish') {
        await apiClient(`/listings/${listing}/channels/${channel}/publish`, { method: 'POST', body: {} });
        toast.success('Publicação enfileirada', label(CHANNEL_TYPE_LABELS, channel));
      } else if (kind === 'remove') {
        await apiClient(`/listings/${listing}/channels/${channel}/remove`, { method: 'POST', body: {} });
        toast.success('Remoção enfileirada', label(CHANNEL_TYPE_LABELS, channel));
      } else if (kind === 'reconcile') {
        const res = await apiClient<{ processed: number }>(`/channels/${channel}/reconcile`, { method: 'POST', body: {} });
        toast.success('Reconciliação concluída', `${String(res.processed)} itens processados`);
      } else {
        const res = await apiClient<{ imported: number }>(`/channels/${channel}/import-leads`, { method: 'POST', body: {} });
        toast.success('Leads importados', `${String(res.imported)} leads`);
      }
      reload();
    } catch (err) {
      toast.error('Falha na operação', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="app-page">
      <PageToolbar
        title="Canais"
        description="Distribuição dos anúncios para portais e integrações."
        actions={
          <Group gap={2}>
            <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={() => { void action('reconcile', null, 'fake'); }}>
              Reconciliar (teste)
            </Button>
            <Button size="sm" variant="secondary" icon={<Icon name="download" size={14} />} onClick={() => { void action('importLeads', null, 'fake'); }}>
              Importar leads (teste)
            </Button>
          </Group>
        }
      />

      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <div className="peg-grid cols-3">
        {ALL_CHANNELS.map((ch) => {
          const stats = channelStats.get(ch) ?? { total: 0, published: 0, pending: 0, failed: 0, removed: 0 };
          return (
            <Card key={ch} title={label(CHANNEL_TYPE_LABELS, ch)} padless>
              <Stack gap={2} style={{ padding: 16 }}>
                <Group gap={2} wrap>
                  <Tag icon="checkCircle">{`${String(stats.published)} publicados`}</Tag>
                  <Tag icon="clock">{`${String(stats.pending)} pendentes`}</Tag>
                  {stats.failed > 0 ? <Tag icon="alertCircle">{`${String(stats.failed)} falhas`}</Tag> : null}
                  {stats.total === 0 ? <Tag icon="alertCircle">não conectado</Tag> : null}
                </Group>
                <Group gap={2}>
                  <Button size="xs" variant="secondary" loading={busyKey === `reconcile:org:${ch}`} onClick={() => { void action('reconcile', null, ch); }}>
                    Reconciliar
                  </Button>
                  <Button size="xs" variant="secondary" loading={busyKey === `importLeads:org:${ch}`} onClick={() => { void action('importLeads', null, ch); }}>
                    Importar leads
                  </Button>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </div>

      <Card title="Publicações por anúncio" padless>
        {loading ? (
          <EmptyState title="Carregando publicações…" icon="share" />
        ) : data && data.listings.length > 0 ? (
          <Stack gap={0}>
            {data.listings.map((l) => (
              <div key={l.listingId} style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                <Group between style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{l.title}</span>
                </Group>
                <Group gap={2} wrap>
                  {l.channels.map((c) => (
                    <div key={c.channel} className="peg-group" style={{ gap: 6, padding: '6px 10px', borderRadius: 'var(--peg-radius-sm)', border: '1px solid var(--peg-border)' }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{label(CHANNEL_TYPE_LABELS, c.channel)}</span>
                      <Badge tone={CHANNEL_STATUS_TONES[c.status] ?? 'neutral'}>{label(CHANNEL_STATUS_LABELS, c.status)}</Badge>
                      {c.status === 'FAILED' && c.lastError ? (
                        <span className="peg-text-tertiary" style={{ fontSize: 11 }} title={c.lastError}>
                          {c.lastError.slice(0, 40)}
                        </span>
                      ) : null}
                      <Group gap={1}>
                        {c.status === 'FAILED' || c.status === 'REMOVED' || c.status === 'PENDING' ? (
                          <Button size="xs" variant="tertiary" loading={busyKey === `publish:${l.listingId}:${c.channel}`} onClick={() => { void action('publish', l.listingId, c.channel); }}>
                            Publicar
                          </Button>
                        ) : null}
                        {c.status === 'PUBLISHED' ? (
                          <Button size="xs" variant="tertiary" loading={busyKey === `remove:${l.listingId}:${c.channel}`} onClick={() => { void action('remove', l.listingId, c.channel); }}>
                            Remover
                          </Button>
                        ) : null}
                      </Group>
                    </div>
                  ))}
                </Group>
              </div>
            ))}
          </Stack>
        ) : (
          <div className="peg-empty" style={{ padding: 24 }}>
            <span className="peg-empty__body">Nenhuma publicação. Crie um listing e publique nos canais.</span>
          </div>
        )}
      </Card>
    </div>
  );
}

export function ChannelsClient() {
  return (
    <ToastProvider>
      <ChannelsBody />
    </ToastProvider>
  );
}
