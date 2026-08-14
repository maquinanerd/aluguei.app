'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Group,
  Icon,
  Inspector,
  InspectorRows,
  InspectorSection,
  Stack,
  Tabs,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDateTime, formatRelative } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, FUNNEL_LABELS, FUNNEL_TONES } from '@/lib/labels';
import { PermissionDenied, ErrorState, EmptyState } from '@aluguei/ui';

interface Lead {
  id: string;
  status: string;
  source: string | null;
  channel: string | null;
  partyId: string | null;
  ownerUserId: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  notes: string | null;
  createdAt: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
  identities: Array<{ kind: string; value: string }>;
}

interface Conversation {
  id: string;
  status: string;
  channel: string;
  updatedAt: string;
}

interface TimelineEvent {
  id: string;
  entityType: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'conversas', label: 'Conversas' },
  { value: 'atividades', label: 'Atividades' },
];

const NEXT_STATUS: Record<string, string[]> = {
  NEW: ['QUALIFYING', 'LOST'],
  QUALIFYING: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['VISIT', 'LOST'],
  VISIT: ['PROPOSAL', 'QUALIFIED', 'LOST'],
  PROPOSAL: ['APPLICATION', 'LOST'],
  APPLICATION: ['WON', 'LOST'],
};

function LeadBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  const leadsQ = useQuery<{ leads: Lead[] }>('/leads?limit=100', [id]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', [id]);
  const convQ = useQuery<{ conversations: Conversation[] }>(`/leads/${id}/conversations`, [id]);
  const timelineQ = useQuery<{ events: TimelineEvent[] }>(`/timeline?entityType=LEAD&entityId=${id}`, [id]);

  const lead = useMemo(() => leadsQ.data?.leads.find((l) => l.id === id) ?? null, [leadsQ.data, id]);
  const party = useMemo(
    () => (lead?.partyId ? partiesQ.data?.parties.find((p) => p.id === lead.partyId) ?? null : null),
    [lead, partiesQ.data],
  );

  if (leadsQ.permissionDenied) return <PermissionDenied title="Sem acesso a leads" />;

  if (!lead) {
    const emptyProps: {
      title: string;
      icon: 'activity' | 'helpCircle';
      body?: string;
      actionLabel?: string;
      onAction?: () => void;
    } = {
      title: leadsQ.loading ? 'Carregando lead…' : 'Lead não encontrado',
      icon: leadsQ.loading ? 'activity' : 'helpCircle',
    };
    if (!leadsQ.loading) {
      emptyProps.body = 'Verifique o endereço ou volte para a lista.';
      emptyProps.actionLabel = 'Voltar para leads';
      emptyProps.onAction = () => { router.push('/app/crm/leads'); };
    }
    return <EmptyState {...emptyProps} />;
  }

  const current = lead;

  async function transition(next: string) {
    setBusy(true);
    try {
      const reason = next === 'LOST' ? window.prompt('Motivo do LOST:') ?? undefined : undefined;
      await apiClient(`/leads/${id}/status`, { method: 'PATCH', body: { status: next, reason } });
      toast.success('Status atualizado', label(FUNNEL_LABELS, next));
      leadsQ.reload();
    } catch (err) {
      toast.error('Falha na transição', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const nextStatuses = NEXT_STATUS[current.status] ?? [];

  return (
    <Stack gap={4} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { label: 'Painel', href: '/app' },
          { label: 'Leads', href: '/app/crm/leads' },
          { label: party?.name ?? 'Lead' },
        ]}
      />

      {/* Lead Header */}
      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Group gap={3}>
            <Avatar name={party?.name ?? 'Lead'} size="lg" brand />
            <Stack gap={1}>
              <Group gap={2}>
                <h1 style={{ fontSize: 20 }}>{party?.name ?? 'Sem contato vinculado'}</h1>
                <Badge tone={FUNNEL_TONES[current.status] ?? 'neutral'}>{label(FUNNEL_LABELS, current.status)}</Badge>
              </Group>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Entrada em {formatDateOnly(current.createdAt)}
                {current.channel ? ` · via ${current.channel}` : ''}
              </span>
            </Stack>
          </Group>
          <Group gap={2}>
            {nextStatuses.map((s) => (
              <Button key={s} size="sm" variant={s === 'LOST' ? 'danger-subtle' : 'brand'} loading={busy} onClick={() => void transition(s)}>
                Mover para {label(FUNNEL_LABELS, s)}
              </Button>
            ))}
          </Group>
        </Group>
      </div>

      {/* Tabs + workspace + rail */}
      <Group stretch gap={0} style={{ alignItems: 'stretch' }}>
        <div className="peg-stack" style={{ flex: 1, minWidth: 0, gap: 16 }}>
          <Tabs items={TABS} value={tab} onChange={setTab} />
          {tab === 'overview' ? (
            <div className="peg-card" style={{ padding: 20 }}>
              <Stack gap={4}>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>Sobre o lead</h3>
                <div className="peg-grid cols-2">
                  <Info label="Fonte" value={current.source ?? '—'} />
                  <Info label="Canal" value={current.channel ?? '—'} />
                  <Info label="Orçamento" value={budgetRange(current)} />
                  <Info label="Contato" value={party ? `${party.name} · ${identityLabel(party)}` : 'Não vinculado'} />
                </div>
                <Stack gap={1}>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Observações</span>
                  <p style={{ fontSize: 14, lineHeight: '21px' }}>{current.notes ?? '—'}</p>
                </Stack>
              </Stack>
            </div>
          ) : null}

          {tab === 'conversas' ? (
            <div className="peg-card" style={{ padding: 20 }}>
              {convQ.loading ? (
                <EmptyState title="Carregando conversas…" icon="messageCircle" />
              ) : convQ.data && convQ.data.conversations.length > 0 ? (
                <Stack gap={2}>
                  {convQ.data.conversations.map((c) => (
                    <Group key={c.id} between style={{ padding: '10px 12px', borderRadius: 'var(--peg-radius-sm)', border: '1px solid var(--peg-border)' }}>
                      <Group gap={2}>
                        <Icon name="messageCircle" size={16} />
                        <span style={{ fontSize: 13 }}>{c.channel}</span>
                      </Group>
                      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                        {formatRelative(c.updatedAt)}
                      </span>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <EmptyState title="Sem conversas" body="Este lead ainda não tem conversas registradas." icon="messageCircle" />
              )}
            </div>
          ) : null}

          {tab === 'atividades' ? (
            <div className="peg-card" style={{ padding: 20 }}>
              {timelineQ.loading ? (
                <EmptyState title="Carregando atividades…" icon="history" />
              ) : timelineQ.data && timelineQ.data.events.length > 0 ? (
                <Stack gap={2}>
                  {timelineQ.data.events.map((e) => (
                    <Group key={e.id} gap={3} style={{ padding: '8px 0', borderBottom: '1px solid var(--peg-border)' }}>
                      <Icon name="history" size={14} />
                      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{eventLabel(e.eventType)}</span>
                        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{formatDateTime(e.occurredAt)}</span>
                      </Stack>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <EmptyState title="Sem atividades" body="O histórico aparecerá conforme o lead avança." icon="history" />
              )}
            </div>
          ) : null}
        </div>

        {/* Context rail */}
        <Inspector>
          <InspectorSection title="Contato">
            <InspectorRows
              rows={[
                { label: 'Nome', value: party?.name ?? '—' },
                { label: 'Tipo', value: party ? (party.type === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física') : '—' },
                { label: 'Documento', value: identityLabel(party) },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Origem">
            <InspectorRows
              rows={[
                { label: 'Canal', value: current.channel ?? '—' },
                { label: 'Fonte', value: current.source ?? '—' },
                { label: 'Entrada', value: formatDateOnly(current.createdAt) },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Orçamento">
            <InspectorRows
              rows={[
                { label: 'Mínimo', value: current.budgetMinCents !== null ? formatBRL(current.budgetMinCents) : '—' },
                { label: 'Máximo', value: current.budgetMaxCents !== null ? formatBRL(current.budgetMaxCents) : '—' },
              ]}
            />
          </InspectorSection>
        </Inspector>
      </Group>

      {leadsQ.error ? <ErrorState body={leadsQ.error} onRetry={leadsQ.reload} /> : null}
    </Stack>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1}>
      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 14 }}>{value}</span>
    </Stack>
  );
}

function budgetRange(lead: Lead): string {
  if (lead.budgetMinCents === null && lead.budgetMaxCents === null) return '—';
  if (lead.budgetMinCents !== null && lead.budgetMaxCents !== null) {
    return `${formatBRL(lead.budgetMinCents)} – ${formatBRL(lead.budgetMaxCents)}`;
  }
  return formatBRL(lead.budgetMinCents ?? lead.budgetMaxCents);
}

function identityLabel(party: Party | null): string {
  if (!party || party.identities.length === 0) return '—';
  return party.identities.map((i) => `${i.kind}: ${i.value}`).join(', ');
}

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    LEAD_CREATED: 'Lead criado',
    LEAD_STATUS_CHANGED: 'Estágio alterado',
    MESSAGE_RECEIVED: 'Mensagem recebida',
    MESSAGE_SENT: 'Mensagem enviada',
    VISIT_SCHEDULED: 'Visita agendada',
    PROPOSAL_CREATED: 'Proposta criada',
    NOTE_ADDED: 'Nota adicionada',
  };
  return map[eventType] ?? eventType;
}

function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function LeadDetailClient() {
  return (
    <ToastProvider>
      <LeadBody />
    </ToastProvider>
  );
}
