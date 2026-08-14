'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  Group,
  Icon,
  SegmentedControl,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatBRL, formatRelative } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, FUNNEL_LABELS, FUNNEL_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, EmptyState } from '@aluguei/ui';

interface Lead {
  id: string;
  status: string;
  source: string | null;
  channel: string | null;
  partyId: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  createdAt: string;
}

interface Party {
  id: string;
  name: string;
}

const PIPELINE_STAGES = ['NEW', 'QUALIFYING', 'QUALIFIED', 'VISIT', 'PROPOSAL', 'APPLICATION', 'WON', 'LOST'];

const NEXT_STATUS: Record<string, string> = {
  NEW: 'QUALIFYING',
  QUALIFYING: 'QUALIFIED',
  QUALIFIED: 'VISIT',
  VISIT: 'PROPOSAL',
  PROPOSAL: 'APPLICATION',
  APPLICATION: 'WON',
};

function PipelineBody() {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState('board');
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, permissionDenied, reload } = useQuery<{ leads: Lead[]; total: number }>('/leads?limit=100', []);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', []);

  const partyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partiesQ.data?.parties ?? []) map.set(p.id, p.name);
    return map;
  }, [partiesQ.data]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a leads" />;

  async function advance(lead: Lead) {
    const next = NEXT_STATUS[lead.status];
    if (!next) return;
    setBusy(lead.id);
    try {
      await apiClient(`/leads/${lead.id}/status`, { method: 'PATCH', body: { status: next } });
      toast.success('Avançado', label(FUNNEL_LABELS, next));
      reload();
    } catch (err) {
      toast.error('Falha ao avançar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const leads = data?.leads ?? [];

  if (view === 'board') {
    return (
      <div className="app-page">
        <PageToolbar
          title="Pipeline"
          description="Kanban operacional do funil de leads."
          actions={
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Quadro' },
                { value: 'table', label: 'Tabela' },
              ]}
            />
          }
        />
        {loading ? (
          <EmptyState title="Carregando pipeline…" icon="activity" />
        ) : leads.length === 0 ? (
          <EmptyState title="Nenhum lead" body="Crie um lead para começar o pipeline." actionLabel="Criar lead" onAction={() => { router.push('/app/crm/leads'); }} />
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {PIPELINE_STAGES.map((stage) => {
              const items = leads.filter((l) => l.status === stage);
              return (
                <section key={stage} style={{ flex: '0 0 220px', minWidth: 220, display: 'flex', flexDirection: 'column' }}>
                  <Group between style={{ padding: '8px 4px' }}>
                    <Group gap={2}>
                      <Badge tone={FUNNEL_TONES[stage] ?? 'neutral'}>{label(FUNNEL_LABELS, stage)}</Badge>
                      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{items.length}</span>
                    </Group>
                  </Group>
                  <Stack gap={2}>
                    {items.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => { router.push(`/app/crm/leads/${lead.id}`); }}
                        className="peg-card"
                        style={{
                          padding: 12,
                          textAlign: 'left',
                          cursor: 'pointer',
                          border: '1px solid var(--peg-border)',
                          background: 'var(--peg-surface)',
                          borderRadius: 'var(--peg-radius-md)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          width: '100%',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{partyName.get(lead.partyId ?? '') ?? 'Sem contato'}</span>
                        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                          {lead.channel ?? lead.source ?? '—'} · {formatRelative(lead.createdAt)}
                        </span>
                        {lead.budgetMinCents !== null ? (
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{formatBRL(lead.budgetMinCents)}</span>
                        ) : null}
                        {NEXT_STATUS[lead.status] ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void advance(lead);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation();
                                void advance(lead);
                              }
                            }}
                            style={{ fontSize: 12, color: 'var(--aluguei-brand-strong)', fontWeight: 500, marginTop: 4 }}
                          >
                            {busy === lead.id ? 'Movendo…' : `→ Avançar para ${label(FUNNEL_LABELS, NEXT_STATUS[lead.status])}`}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </Stack>
                </section>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Contato',
      render: (l) => <span style={{ fontWeight: 500 }}>{partyName.get(l.partyId ?? '') ?? 'Sem contato'}</span>,
    },
    {
      key: 'status',
      header: 'Estágio',
      render: (l) => <Badge tone={FUNNEL_TONES[l.status] ?? 'neutral'}>{label(FUNNEL_LABELS, l.status)}</Badge>,
    },
    { key: 'origin', header: 'Origem', render: (l) => <span className="peg-text-secondary">{l.channel ?? l.source ?? '—'}</span> },
    { key: 'budget', header: 'Orçamento', render: (l) => (l.budgetMinCents !== null ? formatBRL(l.budgetMinCents) : '—') },
    {
      key: 'actions',
      header: '',
      render: (l) =>
        NEXT_STATUS[l.status] ? (
          <Button size="xs" variant="tertiary" loading={busy === l.id} onClick={() => void advance(l)}>
            Avançar
          </Button>
        ) : (
          <Icon name="checkCircle" size={14} />
        ),
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Pipeline"
        description="Visão tabular do funil."
        actions={
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: 'Quadro' },
              { value: 'table', label: 'Tabela' },
            ]}
          />
        }
      />
      <DataTable
        columns={columns}
        rows={leads}
        loading={loading}
        onRowClick={(l) => { router.push(`/app/crm/leads/${l.id}`); }}
        emptyTitle="Nenhum lead"
        emptyBody="Crie um lead para preencher o pipeline."
      />
    </div>
  );
}

export function PipelineClient() {
  return (
    <ToastProvider>
      <PipelineBody />
    </ToastProvider>
  );
}
