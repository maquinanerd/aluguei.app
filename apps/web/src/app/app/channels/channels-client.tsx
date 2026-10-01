'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Icon,
  Modal,
  Select,
  Stack,
  Tag,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { useAllPages } from '@/lib/lookup';
import { channelSelectOptions } from '@/lib/channel-publish';
import type { AvailableChannel } from '@/lib/channel-publish';
import {
  label,
  CHANNEL_STATUS_LABELS,
  CHANNEL_STATUS_TONES,
  CHANNEL_TYPE_LABELS,
  INTEGRATION_STAGE_LABELS,
  INTEGRATION_STAGE_TONES,
} from '@/lib/labels';
import {
  PORTAL_PROPERTY_TYPE_LABELS,
  PUBLICATION_TIER_LABELS,
  acaoDaPublicacao,
  motivoPrincipal,
} from '@/lib/grupo-olx';
import type { Motivo } from '@/lib/grupo-olx';
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

interface ListingChannels {
  channels: Array<{ channel: string; status: string; issues: Motivo[] }>;
}

/** Canal como a API descreve (ADR-107): só os oferecidos aparecem, com o estágio honesto. */
interface ChannelInfo extends AvailableChannel {
  offered: boolean;
  mode: 'PUSH' | 'FEED' | null;
  stage: string;
}

/** Texto curto de cada canal no card. */
const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  grupoolx:
    'Um feed só para ZAP Imóveis, Viva Real e OLX, conforme o plano da imobiliária no Grupo OLX.',
  imovelweb: 'Publicação e retirada no Imovelweb.',
  fake: 'Canal de teste: só existe em desenvolvimento e nos testes.',
};

function ChannelsBody() {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const { data, loading, error, permissionDenied, reload } = useQuery<ChannelSummary>(
    '/channels/summary',
    [],
  );
  const channelsQ = useQuery<{ channels: ChannelInfo[] }>('/channels', []);
  const offered = (channelsQ.data?.channels ?? []).filter((c) => c.offered);

  const channelStats = useMemo(() => {
    const map = new Map<
      string,
      { total: number; published: number; pending: number; failed: number; removed: number }
    >();
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

  if (permissionDenied) return <PermissionDenied title="Sem acesso a canais" />;

  async function action(
    kind: 'publish' | 'remove' | 'reconcile' | 'importLeads',
    listingId: string | null,
    channel: string,
  ) {
    const key = `${kind}:${listingId ?? 'org'}:${channel}`;
    setBusyKey(key);
    try {
      const listing = listingId ?? '';
      if (kind === 'publish') {
        const res = await apiClient<{ publication: { status: string } }>(
          `/listings/${listing}/channels/${channel}/publish`,
          { method: 'POST', body: {} },
        );
        toast.success(
          channel === 'grupoolx' ? 'Anúncio avaliado' : 'Publicação enfileirada',
          channel === 'grupoolx'
            ? label(CHANNEL_STATUS_LABELS, res.publication.status)
            : label(CHANNEL_TYPE_LABELS, channel),
        );
      } else if (kind === 'remove') {
        await apiClient(`/listings/${listing}/channels/${channel}/remove`, {
          method: 'POST',
          body: {},
        });
        toast.success(
          channel === 'grupoolx' ? 'Anúncio fora do feed' : 'Remoção enfileirada',
          label(CHANNEL_TYPE_LABELS, channel),
        );
      } else if (kind === 'reconcile') {
        const res = await apiClient<{ processed: number }>(`/channels/${channel}/reconcile`, {
          method: 'POST',
          body: {},
        });
        toast.success('Reconciliação concluída', `${String(res.processed)} itens processados`);
      } else {
        const res = await apiClient<{ imported: number }>(`/channels/${channel}/import-leads`, {
          method: 'POST',
          body: {},
        });
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
          <Button
            size="sm"
            variant="brand"
            icon={<Icon name="send" size={14} />}
            onClick={() => {
              setPublishOpen(true);
            }}
          >
            Publicar anúncio
          </Button>
        }
      />

      {error ? <ErrorState body={error} onRetry={reload} /> : null}
      {channelsQ.error ? <ErrorState body={channelsQ.error} onRetry={channelsQ.reload} /> : null}

      <div className="peg-grid cols-3">
        {offered.map((info) => {
          const ch = info.channel;
          const stats = channelStats.get(ch) ?? {
            total: 0,
            published: 0,
            pending: 0,
            failed: 0,
            removed: 0,
          };
          return (
            <Card key={ch} title={label(CHANNEL_TYPE_LABELS, ch)} padless>
              <Stack gap={2} style={{ padding: 16 }}>
                <Group gap={2} wrap>
                  <Badge tone={INTEGRATION_STAGE_TONES[info.stage] ?? 'neutral'}>
                    {label(INTEGRATION_STAGE_LABELS, info.stage)}
                  </Badge>
                  {info.mode === 'FEED' ? <Tag icon="share">feed</Tag> : null}
                </Group>
                {CHANNEL_DESCRIPTIONS[ch] ? (
                  <span className="peg-text-secondary" style={{ fontSize: 12 }}>
                    {CHANNEL_DESCRIPTIONS[ch]}
                  </span>
                ) : null}
                {info.stage !== 'IN_PREPARATION' ? (
                  <Group gap={2} wrap>
                    <Tag icon="checkCircle">{`${String(stats.published)} publicados`}</Tag>
                    <Tag icon="clock">{`${String(stats.pending)} pendentes`}</Tag>
                    {stats.failed > 0 ? (
                      <Tag icon="alertCircle">{`${String(stats.failed)} com problema`}</Tag>
                    ) : null}
                  </Group>
                ) : null}
                {ch === 'grupoolx' ? (
                  <Group gap={2}>
                    <Link
                      href="/app/channels/grupo-olx"
                      className="peg-btn peg-btn--secondary peg-btn--xs"
                    >
                      Configurar e acompanhar
                    </Link>
                  </Group>
                ) : null}
                {ch === 'fake' ? (
                  <Group gap={2}>
                    <Button
                      size="xs"
                      variant="secondary"
                      loading={busyKey === 'reconcile:org:fake'}
                      onClick={() => {
                        void action('reconcile', null, 'fake');
                      }}
                    >
                      Reconciliar (teste)
                    </Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      loading={busyKey === 'importLeads:org:fake'}
                      onClick={() => {
                        void action('importLeads', null, 'fake');
                      }}
                    >
                      Importar leads (teste)
                    </Button>
                  </Group>
                ) : null}
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
              <div
                key={l.listingId}
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}
              >
                <Group between style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{l.title}</span>
                </Group>
                <Group gap={2} wrap>
                  {l.channels.map((c) => {
                    const acao = acaoDaPublicacao(c.channel, c.status);
                    return (
                      <div
                        key={c.channel}
                        className="peg-group"
                        style={{
                          gap: 6,
                          padding: '6px 10px',
                          borderRadius: 'var(--peg-radius-sm)',
                          border: '1px solid var(--peg-border)',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 500 }}>
                          {label(CHANNEL_TYPE_LABELS, c.channel)}
                        </span>
                        <Badge tone={CHANNEL_STATUS_TONES[c.status] ?? 'neutral'}>
                          {label(CHANNEL_STATUS_LABELS, c.status)}
                        </Badge>
                        {c.status === 'FAILED' && c.lastError ? (
                          <span
                            className="peg-text-tertiary"
                            style={{ fontSize: 11 }}
                            title={c.lastError}
                          >
                            {c.lastError.slice(0, 40)}
                          </span>
                        ) : null}
                        {c.channel === 'grupoolx' &&
                        (c.status === 'BLOCKED' || c.status === 'IMPORT_ERROR') ? (
                          <MotivoDoGrupoOlx listingId={l.listingId} />
                        ) : null}
                        <Group gap={1}>
                          {acao === 'publicar' ? (
                            <Button
                              size="xs"
                              variant="tertiary"
                              loading={busyKey === `publish:${l.listingId}:${c.channel}`}
                              onClick={() => {
                                void action('publish', l.listingId, c.channel);
                              }}
                            >
                              {c.channel === 'grupoolx' ? 'Reavaliar' : 'Publicar'}
                            </Button>
                          ) : null}
                          {acao === 'remover' ? (
                            <Button
                              size="xs"
                              variant="tertiary"
                              loading={busyKey === `remove:${l.listingId}:${c.channel}`}
                              onClick={() => {
                                void action('remove', l.listingId, c.channel);
                              }}
                            >
                              Remover
                            </Button>
                          ) : null}
                        </Group>
                      </div>
                    );
                  })}
                </Group>
              </div>
            ))}
          </Stack>
        ) : (
          <div className="peg-empty" style={{ padding: 24 }}>
            <span className="peg-empty__body">
              Nenhuma publicação. Crie um listing e publique nos canais.
            </span>
          </div>
        )}
      </Card>

      <PublishListingModal
        open={publishOpen}
        channels={offered}
        onClose={() => {
          setPublishOpen(false);
        }}
        onPublished={() => {
          setPublishOpen(false);
          reload();
        }}
      />
    </div>
  );
}

/** Por que o anúncio está fora do Grupo OLX (lido da publicação, que guarda os motivos). */
function MotivoDoGrupoOlx({ listingId }: { listingId: string }) {
  const { data } = useQuery<ListingChannels>(`/listings/${listingId}/channels`, [listingId]);
  const publicacao = data?.channels.find((c) => c.channel === 'grupoolx');
  const motivo = publicacao ? motivoPrincipal(publicacao.issues) : null;
  if (!motivo) return null;
  return (
    <span className="peg-text-tertiary" style={{ fontSize: 11 }} title={motivo.message}>
      {motivo.message}
    </span>
  );
}

/**
 * Primeira publicação de um anúncio em canal (auditoria 2026-09-10, P1-17): a tela
 * só republicava o que já estava em algum canal. Lista os anúncios publicados
 * (todas as páginas) e os canais oferecidos; canal sem integração aparece
 * desabilitado. No Grupo OLX (ADR-107) a imobiliária escolhe o destaque contratado e,
 * quando o tipo do imóvel não decide sozinho, o tipo no portal.
 */
function PublishListingModal({
  open,
  channels,
  onClose,
  onPublished,
}: {
  open: boolean;
  channels: readonly ChannelInfo[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const toast = useToast();
  const listingsQ = useAllPages<{ id: string; title: string }>(
    open ? '/listings?status=PUBLISHED' : null,
    'listings',
  );
  const [listingId, setListingId] = useState('');
  const [channel, setChannel] = useState('');
  const [tier, setTier] = useState('STANDARD');
  const [portalType, setPortalType] = useState('');
  const [busy, setBusy] = useState(false);
  const grupoOlx = channel === 'grupoolx';
  const typeQ = useQuery<{ defaultType: string | null; options: string[] }>(
    open && grupoOlx && listingId
      ? `/integrations/grupo-olx/listings/${listingId}/property-type-options`
      : null,
    [open, grupoOlx, listingId],
  );
  const precisaTipo = grupoOlx && typeQ.data !== null && typeQ.data.defaultType === null;

  function close() {
    setListingId('');
    setChannel('');
    setTier('STANDARD');
    setPortalType('');
    onClose();
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!listingId || !channel) return;
    setBusy(true);
    try {
      const body = grupoOlx
        ? { publicationTier: tier, ...(portalType ? { portalPropertyType: portalType } : {}) }
        : {};
      const res = await apiClient<{ publication: { status: string } }>(
        `/listings/${listingId}/channels/${channel}/publish`,
        { method: 'POST', body },
      );
      toast.success(
        grupoOlx ? 'Anúncio avaliado para o Grupo OLX' : 'Publicação enviada ao canal',
        grupoOlx
          ? label(CHANNEL_STATUS_LABELS, res.publication.status)
          : label(CHANNEL_TYPE_LABELS, channel),
      );
      setListingId('');
      setChannel('');
      setPortalType('');
      onPublished();
    } catch (err) {
      toast.error('Não foi possível publicar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const noListings = !listingsQ.loading && !listingsQ.error && listingsQ.rows.length === 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Publicar anúncio em canal"
      footer={
        <>
          <Button variant="tertiary" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="publish-listing-form"
            loading={busy}
            disabled={noListings || (precisaTipo && !portalType)}
          >
            Publicar
          </Button>
        </>
      }
    >
      <form
        id="publish-listing-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <Select
          label="Anúncio"
          required
          value={listingId}
          onChange={(e) => {
            setListingId(e.target.value);
            setPortalType('');
          }}
          placeholder={listingsQ.loading ? 'Carregando anúncios…' : 'Selecione o anúncio'}
          options={listingsQ.rows.map((l) => ({ value: l.id, label: l.title }))}
          {...(listingsQ.error
            ? { error: listingsQ.error }
            : noListings
              ? { helper: 'Nenhum anúncio publicado. Publique o anúncio em Anúncios antes.' }
              : listingsQ.truncated
                ? { helper: 'Lista parcial: há mais anúncios publicados do que a tela carrega.' }
                : {})}
        />
        <Select
          label="Canal"
          required
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
          }}
          placeholder={channels.length === 0 ? 'Carregando canais…' : 'Selecione o canal'}
          options={channelSelectOptions(channels)}
        />
        {grupoOlx ? (
          <>
            <Select
              label="Destaque no Grupo OLX"
              value={tier}
              onChange={(e) => {
                setTier(e.target.value);
              }}
              options={Object.entries(PUBLICATION_TIER_LABELS).map(([value, text]) => ({
                value,
                label: text,
              }))}
              helper="O destaque que o contrato da imobiliária com o Grupo OLX permite."
            />
            {typeQ.data && typeQ.data.options.length > 0 ? (
              <Select
                label="Tipo no Grupo OLX"
                {...(precisaTipo ? { required: true } : { optional: true })}
                value={portalType}
                onChange={(e) => {
                  setPortalType(e.target.value);
                }}
                placeholder={
                  typeQ.data.defaultType
                    ? `Padrão: ${label(PORTAL_PROPERTY_TYPE_LABELS, typeQ.data.defaultType)}`
                    : 'Escolha o tipo'
                }
                options={typeQ.data.options.map((value) => ({
                  value,
                  label: label(PORTAL_PROPERTY_TYPE_LABELS, value),
                }))}
                helper={
                  precisaTipo
                    ? 'Comercial e terreno têm mais de uma opção no Grupo OLX: escolha a certa.'
                    : 'Só mude se o padrão não descrever o imóvel.'
                }
              />
            ) : null}
          </>
        ) : null}
      </form>
    </Modal>
  );
}

export function ChannelsClient() {
  return (
    <ToastProvider>
      <ChannelsBody />
    </ToastProvider>
  );
}
