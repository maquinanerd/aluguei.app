'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, DataTable, Select, ToastProvider } from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { useLookup } from '@/lib/lookup';
import { label, APPLICATION_STATUS_LABELS, APPLICATION_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Application {
  id: string;
  leadId: string | null;
  partyId: string;
  propertyId: string;
  proposalId: string | null;
  status: string;
  decisionReason: string | null;
  submittedAt: string | null;
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

function ScreeningBody() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/rental-applications?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{
    applications: Application[];
    total: number;
  }>(queryPath, [queryPath]);
  // Nomes só das linhas da página, por `ids` (antes limit=200 → 400 — P1-01).
  const partyMap = useLookup<Party>(
    'parties',
    (data?.applications ?? []).map((a) => a.partyId),
  ).map;
  const propertyMap = useLookup<Property>(
    'properties',
    (data?.applications ?? []).map((a) => a.propertyId),
  ).map;

  if (permissionDenied) return <PermissionDenied title="Sem acesso a análises de crédito" />;

  const columns: Column<Application>[] = [
    {
      key: 'party',
      header: 'Solicitante',
      render: (a) => (
        <span style={{ fontWeight: 500 }}>{partyMap.get(a.partyId)?.name ?? '—'}</span>
      ),
    },
    {
      key: 'property',
      header: 'Imóvel',
      render: (a) => (
        <span className="peg-text-secondary">{propertyMap.get(a.propertyId)?.title ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <Badge tone={APPLICATION_STATUS_TONES[a.status] ?? 'neutral'}>
          {label(APPLICATION_STATUS_LABELS, a.status)}
        </Badge>
      ),
    },
    {
      key: 'submitted',
      header: 'Enviada em',
      render: (a) => <span className="peg-text-tertiary">{formatDate(a.submittedAt)}</span>,
    },
    {
      key: 'created',
      header: 'Criada em',
      render: (a) => <span className="peg-text-tertiary">{formatDate(a.createdAt)}</span>,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Crédito"
        description="Análises de crédito e screening de locação."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(APPLICATION_STATUS_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            }))}
            aria-label="Filtrar análises"
          />
        }
      />
      <DataTable
        columns={columns}
        rows={data?.applications ?? []}
        loading={loading}
        onRowClick={(a) => {
          router.push(`/app/screening/${a.id}`);
        }}
        emptyTitle="Nenhuma análise"
        emptyBody="As análises de crédito aparecerão quando aplicações forem submetidas."
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}
    </div>
  );
}

export function ScreeningClient() {
  return (
    <ToastProvider>
      <ScreeningBody />
    </ToastProvider>
  );
}
