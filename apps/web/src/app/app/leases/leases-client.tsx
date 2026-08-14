'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  Icon,
  Modal,
  Select,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, LEASE_STATUS_LABELS, LEASE_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Lease {
  id: string;
  contractId: string;
  tenantPartyId: string | null;
  landlordPartyId: string | null;
  propertyId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  monthlyRentCents: number;
  condoFeeCents: number | null;
  createdAt: string;
}

interface Contract {
  id: string;
  status: string;
}

interface Party {
  id: string;
  name: string;
}

interface Property {
  id: string;
  title: string;
}

function LeasesBody() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/leases?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ leases: Lease[]; total: number }>(queryPath, [queryPath]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', []);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', []);
  const contractsQ = useQuery<{ contracts: Contract[]; total: number }>('/contracts?limit=100', []);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a locações" />;

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

  const columns: Column<Lease>[] = [
    {
      key: 'property',
      header: 'Imóvel',
      render: (l) => <span style={{ fontWeight: 500 }}>{propertyMap.get(l.propertyId)?.title ?? '—'}</span>,
    },
    {
      key: 'tenant',
      header: 'Locatário',
      render: (l) => <span className="peg-text-secondary">{l.tenantPartyId ? partyMap.get(l.tenantPartyId)?.name ?? '—' : '—'}</span>,
    },
    {
      key: 'rent',
      header: 'Aluguel',
      render: (l) => <span style={{ fontWeight: 600 }}>{formatBRL(l.monthlyRentCents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) => <Badge tone={LEASE_STATUS_TONES[l.status] ?? 'neutral'}>{label(LEASE_STATUS_LABELS, l.status)}</Badge>,
    },
    {
      key: 'start',
      header: 'Início',
      render: (l) => <span className="peg-text-tertiary">{formatDate(l.startDate)}</span>,
    },
    { key: 'end', header: 'Término', render: (l) => <span className="peg-text-tertiary">{formatDate(l.endDate)}</span> },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Locações"
        description="Locação ativa e contratos em vigência."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(LEASE_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar locações"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Nova locação
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.leases ?? []}
        loading={loading}
        onRowClick={(l) => { router.push(`/app/leases/${l.id}`); }}
        emptyTitle="Nenhuma locação"
        emptyBody="Crie uma locação a partir de um contrato assinado."
        emptyActionLabel="Nova locação"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreateLeaseModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        contracts={(contractsQ.data?.contracts ?? []).filter((c) => c.status === 'SIGNED')}
        onCreated={() => {
          toast.success('Locação criada');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateLeaseModal({
  open,
  onClose,
  contracts,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  contracts: Contract[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [contractId, setContractId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!contractId) return;
    setBusy(true);
    try {
      await apiClient('/leases', { method: 'POST', body: { contractId } });
      setContractId('');
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
      title="Nova locação"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-lease-form" loading={busy}>Criar</Button>
        </>
      }
    >
      <form id="create-lease-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Select
          label="Contrato assinado"
          required
          value={contractId}
          onChange={(e) => { setContractId(e.target.value); }}
          placeholder="Selecione o contrato…"
          options={contracts.map((c) => ({ value: c.id, label: c.id.slice(0, 8) }))}
        />
        <p className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Somente contratos assinados podem virar locação.
        </p>
      </form>
    </Modal>
  );
}

export function LeasesClient() {
  return (
    <ToastProvider>
      <LeasesBody />
    </ToastProvider>
  );
}
