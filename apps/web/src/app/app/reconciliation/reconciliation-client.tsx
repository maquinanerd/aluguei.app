'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  DataTable,
  Group,
  Icon,
  Select,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, RECONCILIATION_STATUS_LABELS, RECONCILIATION_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Reconciliation {
  id: string;
  provider: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  providerTotalCents: number | null;
  localTotalCents: number | null;
  createdAt: string;
}

function ReconciliationBody() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (status) params.set('status', status);
    return `/reconciliations?${params.toString()}`;
  }, [status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ reconciliations: Reconciliation[]; total: number }>(queryPath, [queryPath]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso à conciliação" />;

  async function run() {
    setBusy(true);
    try {
      await apiClient('/reconciliations', { method: 'POST', body: {} });
      toast.success('Conciliação solicitada', 'Processamento em andamento.');
      reload();
    } catch (err) {
      toast.error('Falha na conciliação', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Reconciliation>[] = [
    {
      key: 'period',
      header: 'Período',
      render: (r) => (
        <span style={{ fontWeight: 500 }}>
          {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
        </span>
      ),
    },
    { key: 'provider', header: 'Provedor', render: (r) => <Badge tone="neutral">{r.provider}</Badge> },
    {
      key: 'total',
      header: 'Totais',
      render: (r) => (
        <Group gap={2}>
          <span>provedor {formatBRL(r.providerTotalCents)}</span>
          <span className="peg-text-tertiary">local {formatBRL(r.localTotalCents)}</span>
        </Group>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={RECONCILIATION_STATUS_TONES[r.status] ?? 'neutral'}>{label(RECONCILIATION_STATUS_LABELS, r.status)}</Badge>,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Conciliação"
        description="Conciliação de pagamentos entre provedor e ledger local."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); }}
            placeholder="Todos os status"
            options={Object.entries(RECONCILIATION_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar conciliações"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="refresh" size={14} />} loading={busy} onClick={() => { void run(); }}>
            Conciliar agora
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.reconciliations ?? []}
        loading={loading}
        emptyTitle="Nenhuma conciliação"
        emptyBody="Rode uma conciliação para comparar provedor e ledger."
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}
    </div>
  );
}

export function ReconciliationClient() {
  return (
    <ToastProvider>
      <ReconciliationBody />
    </ToastProvider>
  );
}
