'use client';

import { useCallback, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  Dropdown,
  Icon,
  Input,
  Modal,
  Pagination,
  Select,
  Stack,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, FUNNEL_LABELS, FUNNEL_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

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
  updatedAt: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
}

interface LeadsResponse {
  leads: Lead[];
  total: number;
}

const STATUS_OPTIONS = Object.entries(FUNNEL_LABELS).map(([value, l]) => ({ value, label: l }));

const NEXT_STATUS: Record<string, string[]> = {
  NEW: ['QUALIFYING', 'LOST'],
  QUALIFYING: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['VISIT', 'LOST'],
  VISIT: ['PROPOSAL', 'QUALIFIED', 'LOST'],
  PROPOSAL: ['APPLICATION', 'LOST'],
  APPLICATION: ['WON', 'LOST'],
};

function LeadsBody() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [createOpen, setCreateOpen] = useState(false);
  const [transiting, setTransiting] = useState<string | null>(null);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/leads?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<LeadsResponse>(queryPath, [queryPath]);
  const parties = useQuery<{ parties: Party[] }>('/parties?limit=200', []);

  const partyName = useCallback(
    (id: string | null) => parties.data?.parties.find((p) => p.id === id)?.name ?? null,
    [parties.data],
  );

  const leads = useMemo(() => {
    const rows = data?.leads ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((l) => {
          const name = partyName(l.partyId) ?? '';
          return name.toLowerCase().includes(q) || (l.channel ?? '').toLowerCase().includes(q) || (l.source ?? '').toLowerCase().includes(q);
        })
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      const av = String(a[sortKey as keyof Lead] ?? '');
      const bv = String(b[sortKey as keyof Lead] ?? '');
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [data, search, sortKey, sortDir, partyName]);

  async function createLead(input: { source?: string; channel?: string; budgetMinCents?: number; notes?: string }) {
    try {
      await apiClient('/leads', { method: 'POST', body: input });
      toast.success('Lead criado', 'Adicionado ao funil.');
      setCreateOpen(false);
      reload();
    } catch (err) {
      toast.error('Falha ao criar', err instanceof Error ? err.message : undefined);
    }
  }

  async function transitionStatus(leadId: string, next: string) {
    setTransiting(leadId);
    try {
      const reason = next === 'LOST' ? window.prompt('Motivo do LOST:') ?? undefined : undefined;
      await apiClient(`/leads/${leadId}/status`, { method: 'PATCH', body: { status: next, reason } });
      toast.success('Status atualizado', label(FUNNEL_LABELS, next));
      reload();
    } catch (err) {
      toast.error('Falha na transição', err instanceof Error ? err.message : undefined);
    } finally {
      setTransiting(null);
    }
  }

  if (permissionDenied) {
    return <PermissionDenied title="Sem acesso a leads" />;
  }

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Contato',
      sortable: true,
      render: (l) => (
        <span style={{ fontWeight: 500 }}>{partyName(l.partyId) ?? 'Sem contato'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Estágio',
      sortable: true,
      render: (l) => <Badge tone={FUNNEL_TONES[l.status] ?? 'neutral'}>{label(FUNNEL_LABELS, l.status)}</Badge>,
    },
    {
      key: 'channel',
      header: 'Origem',
      render: (l) => (
        <span className="peg-text-secondary">
          {l.channel ?? l.source ?? '—'}
        </span>
      ),
    },
    {
      key: 'budget',
      header: 'Orçamento',
      render: (l) => (
        <span>
          {l.budgetMinCents !== null ? formatBRL(l.budgetMinCents) : '—'}
          {l.budgetMaxCents !== null && l.budgetMaxCents !== l.budgetMinCents ? ` – ${formatBRL(l.budgetMaxCents)}` : ''}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Entrada',
      sortable: true,
      render: (l) => <span className="peg-text-tertiary">{formatDate(l.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (l) => {
        const next = NEXT_STATUS[l.status] ?? [];
        return (
          <Dropdown
            ariaLabel={`Ações do lead ${partyName(l.partyId) ?? l.id}`}
            trigger={
              <Button variant="tertiary" size="xs" disabled={transiting === l.id}>
                {transiting === l.id ? '…' : 'Mover'}
              </Button>
            }
            items={[
              ...next.map((s) => ({
                key: s,
                label: `→ ${label(FUNNEL_LABELS, s)}`,
                onSelect: () => void transitionStatus(l.id, s),
              })),
              {
                key: 'open',
                label: 'Abrir Lead 360',
                icon: 'externalLink',
                onSelect: () => { router.push(`/app/crm/leads/${l.id}`); },
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Leads"
        description="Funil de captação e qualificação."
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar por contato ou origem…' }}
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os estágios"
            options={STATUS_OPTIONS}
            aria-label="Filtrar por estágio"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Novo lead
          </Button>
        }
      />

      <Stack gap={3}>
        <DataTable
          columns={columns}
          rows={leads}
          loading={loading}
          selectedIds={selected}
          onSelectIds={setSelected}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(k) => {
            if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
            else {
              setSortKey(k);
              setSortDir('asc');
            }
          }}
          onRowClick={(l) => { router.push(`/app/crm/leads/${l.id}`); }}
          emptyTitle="Nenhum lead"
          emptyBody="Crie um lead ou aguarde novos contatos pelos canais."
          emptyActionLabel="Criar lead"
          onEmptyAction={() => { setCreateOpen(true); }}
        />
        <Pagination page={page} pageSize={50} total={data?.total ?? 0} onPageChange={setPage} />
      </Stack>

      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreateLeadModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        onCreate={(input) => { void createLead(input); }}
      />
    </div>
  );
}

function CreateLeadModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { source?: string; channel?: string; budgetMinCents?: number; notes?: string }) => void;
}) {
  const [source, setSource] = useState('');
  const [channel, setChannel] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  function submit(e: SyntheticEvent) {
    e.preventDefault();
    setBusy(true);
    const input: { source?: string; channel?: string; budgetMinCents?: number; notes?: string } = {};
    if (source) input.source = source;
    if (channel) input.channel = channel;
    if (budget) {
      const cents = Math.round(parseFloat(budget.replace(',', '.')) * 100);
      if (Number.isFinite(cents) && cents > 0) input.budgetMinCents = cents;
    }
    if (notes) input.notes = notes;
    onCreate(input);
    setSource('');
    setChannel('');
    setBudget('');
    setNotes('');
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo lead"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-lead-form" loading={busy}>Criar lead</Button>
        </>
      }
    >
      <form id="create-lead-form" className="peg-stack" style={{ gap: 16 }} onSubmit={submit}>
        <Input label="Canal de origem" optional placeholder="WhatsApp, site, portal…" value={channel} onChange={(e) => { setChannel(e.target.value); }} />
        <Input label="Fonte" optional placeholder="Campanha, indicação…" value={source} onChange={(e) => { setSource(e.target.value); }} />
        <Input label="Orçamento mínimo (R$)" optional inputMode="decimal" placeholder="3.500" value={budget} onChange={(e) => { setBudget(e.target.value); }} />
        <Textarea label="Observações" optional rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); }} />
      </form>
    </Modal>
  );
}

export function LeadsClient() {
  return (
    <ToastProvider>
      <LeadsBody />
    </ToastProvider>
  );
}
