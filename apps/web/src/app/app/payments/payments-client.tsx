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
import { label, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from '@/lib/labels';
import { PAYMENT_METHOD_LABELS } from '../charges/finance-labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Payment {
  id: string;
  chargeId: string;
  amountCents: number;
  method: string;
  status: string;
  providerPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

function PaymentsBody() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/payments?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ payments: Payment[]; total: number }>(queryPath, [queryPath]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a pagamentos" />;

  const columns: Column<Payment>[] = [
    {
      key: 'amount',
      header: 'Valor',
      render: (p) => <span style={{ fontWeight: 600 }}>{formatBRL(p.amountCents)}</span>,
    },
    {
      key: 'method',
      header: 'Método',
      render: (p) => <Badge tone="neutral">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge tone={PAYMENT_STATUS_TONES[p.status] ?? 'neutral'}>{label(PAYMENT_STATUS_LABELS, p.status)}</Badge>,
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
          {p.providerPaymentId ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Pagamentos"
        description="Recebimentos confirmados e pendentes."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(PAYMENT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar pagamentos"
          />
        }
      />
      <DataTable
        columns={columns}
        rows={data?.payments ?? []}
        loading={loading}
        emptyTitle="Nenhum pagamento"
        emptyBody="Os pagamentos registrados aparecerão aqui."
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}
    </div>
  );
}

export function PaymentsClient() {
  return (
    <ToastProvider>
      <PaymentsBody />
    </ToastProvider>
  );
}
