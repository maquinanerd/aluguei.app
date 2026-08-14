'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  DataTable,
  Select,
  ToastProvider,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatBRL, formatDateTime } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { label, PAYOUT_STATUS_LABELS } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Payout {
  id: string;
  partyId: string | null;
  amountCents: number;
  status: string;
  providerPayoutId: string | null;
  paidAt: string | null;
  createdAt: string;
}

function PayoutsBody() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/payouts?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ payouts: Payout[]; total: number }>(queryPath, [queryPath]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a repasses" />;

  const columns: Column<Payout>[] = [
    {
      key: 'amount',
      header: 'Valor',
      render: (p) => <span style={{ fontWeight: 600 }}>{formatBRL(p.amountCents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={p.status === 'PAID' ? 'success' : p.status === 'FAILED' ? 'danger' : 'warning'}>
          {label(PAYOUT_STATUS_LABELS, p.status)}
        </Badge>
      ),
    },
    {
      key: 'paidAt',
      header: 'Pago em',
      render: (p) => <span className="peg-text-tertiary">{formatDateTime(p.paidAt)}</span>,
    },
    {
      key: 'provider',
      header: 'Provedor',
      render: (p) => (
        <span className="peg-text-mono peg-text-tertiary" style={{ fontSize: 11 }}>
          {p.providerPayoutId ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Repasses"
        description="Repasses aos proprietários após split."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(PAYOUT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar repasses"
          />
        }
      />
      <DataTable
        columns={columns}
        rows={data?.payouts ?? []}
        loading={loading}
        emptyTitle="Nenhum repasse"
        emptyBody="Os repasses gerados pelo split aparecerão aqui."
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}
    </div>
  );
}

export function PayoutsClient() {
  return (
    <ToastProvider>
      <PayoutsBody />
    </ToastProvider>
  );
}
