'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  Icon,
  Input,
  Modal,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, VISIT_STATUS_LABELS, VISIT_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Visit {
  id: string;
  leadId: string | null;
  partyId: string | null;
  propertyId: string | null;
  scheduledAt: string;
  status: string;
  note: string | null;
  createdAt: string;
}

interface Party {
  id: string;
  name: string;
}

interface Property {
  id: string;
  title: string;
}

function VisitsBody() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/visits?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ visits: Visit[]; total: number }>(queryPath, [queryPath]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', []);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', []);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a visitas" />;

  const partyMap = useMemo(() => {
    const m = new Map<string, Party>();
    for (const p of partiesQ.data?.parties ?? []) m.set(p.id, p);
    return m;
  }, [partiesQ.data]);

  const propertyMap = useMemo(() => {
    const m = new Map<string, Property>();
    for (const p of propsQ.data?.properties ?? []) m.set(p.id, p);
    return m;
  }, [propsQ.data]);

  const detail = detailId ? data?.visits.find((v) => v.id === detailId) ?? null : null;

  const columns: Column<Visit>[] = [
    {
      key: 'when',
      header: 'Quando',
      sortable: true,
      render: (v) => <span style={{ fontWeight: 500 }}>{formatDateTime(v.scheduledAt)}</span>,
    },
    {
      key: 'property',
      header: 'Imóvel',
      render: (v) => <span className="peg-text-secondary">{propertyMap.get(v.propertyId ?? '')?.title ?? '—'}</span>,
    },
    {
      key: 'party',
      header: 'Interessado',
      render: (v) => <span className="peg-text-secondary">{partyMap.get(v.partyId ?? '')?.name ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => <Badge tone={VISIT_STATUS_TONES[v.status] ?? 'neutral'}>{label(VISIT_STATUS_LABELS, v.status)}</Badge>,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Visitas"
        description="Agenda de visitas aos imóveis."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(VISIT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar visitas"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Agendar visita
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.visits ?? []}
        loading={loading}
        onRowClick={(v) => { setDetailId(v.id); }}
        emptyTitle="Nenhuma visita"
        emptyBody="Agende visitas para os interessados nos imóveis."
        emptyActionLabel="Agendar visita"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <Drawer
        open={detail !== null}
        onClose={() => { setDetailId(null); }}
        title="Detalhe da visita"
        footer={
          <Button variant="secondary" onClick={() => { setDetailId(null); }}>
            Fechar
          </Button>
        }
      >
        {detail ? (
          <Stack gap={4}>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Data e hora</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{formatDateTime(detail.scheduledAt)}</span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Imóvel</span>
              <span style={{ fontSize: 14 }}>{propertyMap.get(detail.propertyId ?? '')?.title ?? '—'}</span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Interessado</span>
              <span style={{ fontSize: 14 }}>{partyMap.get(detail.partyId ?? '')?.name ?? '—'}</span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</span>
              <Badge tone={VISIT_STATUS_TONES[detail.status] ?? 'neutral'}>{label(VISIT_STATUS_LABELS, detail.status)}</Badge>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Observação</span>
              <span style={{ fontSize: 13 }}>{detail.note ?? '—'}</span>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      <CreateVisitModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        onCreated={() => {
          toast.success('Visita agendada');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateVisitModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!scheduledAt) return;
    setBusy(true);
    try {
      const body: { scheduledAt: string; note?: string } = { scheduledAt: new Date(scheduledAt).toISOString() };
      if (note.trim()) body.note = note.trim();
      await apiClient('/visits', { method: 'POST', body });
      setScheduledAt('');
      setNote('');
      onCreated();
    } catch (err) {
      toast.error('Falha ao agendar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agendar visita"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-visit-form" loading={busy}>Agendar</Button>
        </>
      }
    >
      <form id="create-visit-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Input label="Data e hora" type="datetime-local" required value={scheduledAt} onChange={(e) => { setScheduledAt(e.target.value); }} />
        <Input label="Observação" optional value={note} onChange={(e) => { setNote(e.target.value); }} placeholder="Ex.: Confirmar com o interessado" />
      </form>
    </Modal>
  );
}

export function VisitsClient() {
  return (
    <ToastProvider>
      <VisitsBody />
    </ToastProvider>
  );
}
