'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Group,
  Icon,
  Input,
  Inspector,
  InspectorRows,
  InspectorSection,
  Modal,
  MoneyInput,
  Select,
  Stack,
  Tabs,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDateTime, formatRelative } from '@aluguei/ui';
import { ReasonModal } from '@/components/reason-modal';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { useLookup } from '@/lib/lookup';
import { formatIdentityValue } from '@/lib/party-rules';
import { label, FUNNEL_LABELS, FUNNEL_TONES, ROLE_LABELS } from '@/lib/labels';
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

interface TeamMember {
  id: string;
  userId: string;
  name: string;
  role: string;
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
  const [editOpen, setEditOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  // Detalhe pela rota própria (auditoria 2026-09-10, P2-03: antes a lista inteira era filtrada).
  const leadQ = useQuery<{ lead: Lead; interestedPropertyIds: string[] }>(`/leads/${id}`, [id]);
  const teamQ = useQuery<{ members: TeamMember[] }>('/me/members', []);
  const convQ = useQuery<{ conversations: Conversation[] }>(`/leads/${id}/conversations`, [id]);
  const timelineQ = useQuery<{ events: TimelineEvent[] }>(
    `/timeline?entityType=LEAD&entityId=${id}`,
    [id],
  );

  const lead = leadQ.data?.lead ?? null;
  // Contato do lead por `ids` (antes limit=200 → 400 — P1-01).
  const partyLookup = useLookup<Party>('parties', [lead?.partyId]);
  const party = lead?.partyId ? (partyLookup.map.get(lead.partyId) ?? null) : null;

  if (leadQ.permissionDenied) return <PermissionDenied title="Sem acesso a leads" />;

  if (!lead) {
    const emptyProps: {
      title: string;
      icon: 'activity' | 'helpCircle';
      body?: string;
      actionLabel?: string;
      onAction?: () => void;
    } = {
      title: leadQ.loading ? 'Carregando lead…' : 'Lead não encontrado',
      icon: leadQ.loading ? 'activity' : 'helpCircle',
    };
    if (!leadQ.loading) {
      emptyProps.body = 'Verifique o endereço ou volte para a lista.';
      emptyProps.actionLabel = 'Voltar para leads';
      emptyProps.onAction = () => {
        router.push('/app/crm/leads');
      };
    }
    return <EmptyState {...emptyProps} />;
  }

  const current = lead;
  const team = teamQ.data?.members ?? [];
  const owner = team.find((member) => member.userId === current.ownerUserId) ?? null;

  async function transition(next: string, reason?: string) {
    setBusy(true);
    try {
      await apiClient(`/leads/${id}/status`, {
        method: 'PATCH',
        body: reason === undefined ? { status: next } : { status: next, reason },
      });
      toast.success('Status atualizado', label(FUNNEL_LABELS, next));
      setLostOpen(false);
      leadQ.reload();
      timelineQ.reload();
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
                <Badge tone={FUNNEL_TONES[current.status] ?? 'neutral'}>
                  {label(FUNNEL_LABELS, current.status)}
                </Badge>
              </Group>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Entrada em {formatDateOnly(current.createdAt)}
                {current.channel ? ` · via ${current.channel}` : ''}
              </span>
            </Stack>
          </Group>
          <Group gap={2} wrap>
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon name="edit" size={14} />}
              onClick={() => {
                setEditOpen(true);
              }}
            >
              Editar lead
            </Button>
            {nextStatuses.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'LOST' ? 'danger-subtle' : 'brand'}
                loading={busy}
                onClick={() => {
                  if (s === 'LOST') {
                    setLostOpen(true);
                    return;
                  }
                  void transition(s);
                }}
              >
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
                  <Info label="Responsável" value={owner?.name ?? 'Sem responsável'} />
                  <Info
                    label="Contato"
                    value={party ? `${party.name} · ${identityLabel(party)}` : 'Não vinculado'}
                  />
                  <Info
                    label="Imóveis de interesse"
                    value={String(leadQ.data?.interestedPropertyIds.length ?? 0)}
                  />
                </div>
                <Stack gap={1}>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    Observações
                  </span>
                  <p style={{ fontSize: 14, lineHeight: '21px', whiteSpace: 'pre-wrap' }}>
                    {current.notes ?? '—'}
                  </p>
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
                    <Group
                      key={c.id}
                      between
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--peg-radius-sm)',
                        border: '1px solid var(--peg-border)',
                      }}
                    >
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
                <EmptyState
                  title="Sem conversas"
                  body="Este lead ainda não tem conversas registradas."
                  icon="messageCircle"
                />
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
                    <Group
                      key={e.id}
                      gap={3}
                      style={{ padding: '8px 0', borderBottom: '1px solid var(--peg-border)' }}
                    >
                      <Icon name="history" size={14} />
                      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>
                          {eventLabel(e.eventType)}
                        </span>
                        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                          {formatDateTime(e.occurredAt)}
                        </span>
                      </Stack>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <EmptyState
                  title="Sem atividades"
                  body="O histórico aparecerá conforme o lead avança."
                  icon="history"
                />
              )}
            </div>
          ) : null}
        </div>

        {/* Context rail */}
        <Inspector>
          <InspectorSection title="Responsável">
            <InspectorRows
              rows={[
                { label: 'Nome', value: owner?.name ?? 'Sem responsável' },
                { label: 'Função', value: owner ? label(ROLE_LABELS, owner.role) : '—' },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Contato">
            <InspectorRows
              rows={[
                { label: 'Nome', value: party?.name ?? '—' },
                {
                  label: 'Tipo',
                  value: party
                    ? party.type === 'COMPANY'
                      ? 'Pessoa jurídica'
                      : 'Pessoa física'
                    : '—',
                },
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
                {
                  label: 'Mínimo',
                  value: current.budgetMinCents !== null ? formatBRL(current.budgetMinCents) : '—',
                },
                {
                  label: 'Máximo',
                  value: current.budgetMaxCents !== null ? formatBRL(current.budgetMaxCents) : '—',
                },
              ]}
            />
          </InspectorSection>
        </Inspector>
      </Group>

      {leadQ.error ? <ErrorState body={leadQ.error} onRetry={leadQ.reload} /> : null}

      {editOpen ? (
        <EditLeadModal
          lead={current}
          team={team}
          onClose={() => {
            setEditOpen(false);
          }}
          onSaved={() => {
            toast.success('Lead atualizado');
            setEditOpen(false);
            leadQ.reload();
            timelineQ.reload();
          }}
        />
      ) : null}
      {lostOpen ? (
        <ReasonModal
          title="Marcar como perdido"
          confirmLabel="Marcar como perdido"
          busy={busy}
          hint="O lead sai do funil e não volta. O motivo fica no histórico."
          onClose={() => {
            setLostOpen(false);
          }}
          onConfirm={(reason) => void transition('LOST', reason)}
        />
      ) : null}
    </Stack>
  );
}

type LeadPatch = Partial<{
  ownerUserId: string | null;
  source: string | null;
  channel: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  notes: string | null;
}>;

/** Edição de dados e responsável (P2-03). O status muda só pelo funil. */
function EditLeadModal({
  lead,
  team,
  onClose,
  onSaved,
}: {
  lead: Lead;
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ownerUserId, setOwnerUserId] = useState(lead.ownerUserId ?? '');
  const [source, setSource] = useState(lead.source ?? '');
  const [channel, setChannel] = useState(lead.channel ?? '');
  const [budgetMin, setBudgetMin] = useState<number | null>(lead.budgetMinCents);
  const [budgetMax, setBudgetMax] = useState<number | null>(lead.budgetMaxCents);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
      setError('O orçamento mínimo não pode passar do máximo');
      return;
    }
    const text = (value: string): string | null => (value.trim() === '' ? null : value.trim());
    // Só o que mudou: a auditoria guarda o diff campo a campo.
    const body: LeadPatch = {};
    if ((ownerUserId || null) !== lead.ownerUserId) body.ownerUserId = ownerUserId || null;
    if (text(source) !== lead.source) body.source = text(source);
    if (text(channel) !== lead.channel) body.channel = text(channel);
    if (budgetMin !== lead.budgetMinCents) body.budgetMinCents = budgetMin;
    if (budgetMax !== lead.budgetMaxCents) body.budgetMaxCents = budgetMax;
    if (text(notes) !== lead.notes) body.notes = text(notes);
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/leads/${lead.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar lead"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="edit-lead-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="edit-lead-form"
        className="peg-stack"
        style={{ gap: 16 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {error ? (
          <span className="peg-field__error" role="alert">
            {error}
          </span>
        ) : null}
        <Select
          label="Responsável"
          value={ownerUserId}
          onChange={(e) => {
            setOwnerUserId(e.target.value);
          }}
          placeholder="Sem responsável"
          options={team.map((member) => ({
            value: member.userId,
            label: `${member.name} · ${label(ROLE_LABELS, member.role)}`,
          }))}
        />
        <div className="peg-grid cols-2">
          <Input
            label="Fonte"
            optional
            maxLength={100}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
            }}
          />
          <Input
            label="Canal"
            optional
            maxLength={100}
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
            }}
          />
          <MoneyInput
            label="Orçamento mínimo (R$)"
            optional
            valueCents={budgetMin}
            onValueChange={setBudgetMin}
          />
          <MoneyInput
            label="Orçamento máximo (R$)"
            optional
            valueCents={budgetMax}
            onValueChange={setBudgetMax}
          />
        </div>
        <Textarea
          label="Observações"
          optional
          rows={4}
          maxLength={5000}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
      </form>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1}>
      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
        {label}
      </span>
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
  return party.identities
    .map((i) => `${i.kind}: ${formatIdentityValue(i.kind, i.value)}`)
    .join(', ');
}

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    LEAD_CREATED: 'Lead criado',
    LEAD_STATUS_CHANGED: 'Estágio alterado',
    LEAD_UPDATED: 'Dados do lead alterados',
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
