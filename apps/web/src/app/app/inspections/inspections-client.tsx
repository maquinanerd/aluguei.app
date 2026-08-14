'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  Group,
  Icon,
  Input,
  Modal,
  Select,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, INSPECTION_STATUS_LABELS, INSPECTION_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Inspection {
  id: string;
  propertyId: string;
  type: string;
  status: string;
  startedBy: string | null;
  scheduledAt: string | null;
  createdAt: string;
}

interface Property {
  id: string;
  title: string;
}

const TYPE_LABELS: Record<string, string> = {
  CHECKIN: 'Entrada',
  CHECKOUT: 'Saída',
  INTERMEDIATE: 'Intermediária',
};

function InspectionsBody() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    return `/inspections?${params.toString()}`;
  }, [page, status, type]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ inspections: Inspection[]; total: number }>(queryPath, [queryPath]);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', []);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a vistorias" />;

  const propertyMap = useMemo(() => {
    const m = new Map<string, Property>();
    for (const p of propsQ.data?.properties ?? []) m.set(p.id, p);
    return m;
  }, [propsQ.data]);

  const columns: Column<Inspection>[] = [
    {
      key: 'property',
      header: 'Imóvel',
      render: (i) => <span style={{ fontWeight: 500 }}>{propertyMap.get(i.propertyId)?.title ?? '—'}</span>,
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (i) => <Badge tone="neutral">{TYPE_LABELS[i.type] ?? i.type}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <Badge tone={INSPECTION_STATUS_TONES[i.status] ?? 'neutral'}>{label(INSPECTION_STATUS_LABELS, i.status)}</Badge>,
    },
    {
      key: 'scheduled',
      header: 'Agendada para',
      render: (i) => <span className="peg-text-tertiary">{formatDate(i.scheduledAt)}</span>,
    },
    { key: 'created', header: 'Criada em', render: (i) => <span className="peg-text-tertiary">{formatDate(i.createdAt)}</span> },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Vistorias"
        description="Inspeções de entrada e saída com laudo."
        filters={
          <Group gap={2}>
            <Select
              size="sm"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(0);
              }}
              placeholder="Todos os tipos"
              options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              aria-label="Filtrar por tipo"
            />
            <Select
              size="sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
              placeholder="Todos os status"
              options={Object.entries(INSPECTION_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              aria-label="Filtrar por status"
            />
          </Group>
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Nova vistoria
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.inspections ?? []}
        loading={loading}
        onRowClick={(i) => { router.push(`/app/inspections/${i.id}`); }}
        emptyTitle="Nenhuma vistoria"
        emptyBody="Agende uma vistoria para o imóvel."
        emptyActionLabel="Nova vistoria"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreateInspectionModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        properties={propsQ.data?.properties ?? []}
        onCreated={() => {
          toast.success('Vistoria criada');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateInspectionModal({
  open,
  onClose,
  properties,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  properties: Property[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [propertyId, setPropertyId] = useState('');
  const [type, setType] = useState('CHECKIN');
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!propertyId) return;
    setBusy(true);
    try {
      const body: { propertyId: string; type: string; scheduledAt?: string } = { propertyId, type };
      if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();
      await apiClient('/inspections', { method: 'POST', body });
      setPropertyId('');
      setType('CHECKIN');
      setScheduledAt('');
      onCreated();
    } catch (err) {
      toast.error('Falha ao criar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova vistoria"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-inspection-form" loading={busy}>Criar</Button>
        </>
      }
    >
      <form id="create-inspection-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Select
          label="Imóvel"
          required
          value={propertyId}
          onChange={(e) => { setPropertyId(e.target.value); }}
          placeholder="Selecione o imóvel…"
          options={properties.map((p) => ({ value: p.id, label: p.title }))}
        />
        <Select
          label="Tipo"
          value={type}
          onChange={(e) => { setType(e.target.value); }}
          options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <Input label="Agendada para" type="datetime-local" optional value={scheduledAt} onChange={(e) => { setScheduledAt(e.target.value); }} />
      </form>
    </Modal>
  );
}

export function InspectionsClient() {
  return (
    <ToastProvider>
      <InspectionsBody />
    </ToastProvider>
  );
}
