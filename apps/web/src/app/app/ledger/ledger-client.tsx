'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  DataTable,
  Select,
  Stack,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatBRL, formatDateTime } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  amountCents: number;
  entryType: 'DEBIT' | 'CREDIT';
  referenceType: string;
  referenceId: string;
  description: string | null;
  createdAt: string;
}

function LedgerBody() {
  const [accountId, setAccountId] = useState('');

  const accountsQ = useQuery<{ accounts: LedgerAccount[] }>('/ledger/accounts', []);
  const entriesQ = useQuery<{ entries: LedgerEntry[]; total: number }>(
    accountId ? `/ledger/entries?limit=100&accountId=${accountId}` : '/ledger/entries?limit=100',
    [accountId],
  );

  if (entriesQ.permissionDenied) return <PermissionDenied title="Sem acesso ao ledger" />;

  const accountMap = useMemo(() => {
    const m = new Map<string, LedgerAccount>();
    for (const a of accountsQ.data?.accounts ?? []) m.set(a.id, a);
    return m;
  }, [accountsQ.data]);

  const balance = useMemo(() => {
    const entries = entriesQ.data?.entries ?? [];
    const debits = entries.filter((e) => e.entryType === 'DEBIT').reduce((s, e) => s + e.amountCents, 0);
    const credits = entries.filter((e) => e.entryType === 'CREDIT').reduce((s, e) => s + e.amountCents, 0);
    return { debits, credits, net: debits - credits };
  }, [entriesQ.data]);

  const columns: Column<LedgerEntry>[] = [
    {
      key: 'account',
      header: 'Conta',
      render: (e) => {
        const acc = accountMap.get(e.accountId);
        return (
          <Stack gap={0}>
            <span style={{ fontWeight: 500 }}>{acc?.name ?? '—'}</span>
            <span className="peg-text-mono peg-text-tertiary" style={{ fontSize: 11 }}>{acc?.code ?? ''}</span>
          </Stack>
        );
      },
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (e) => <Badge tone={e.entryType === 'DEBIT' ? 'danger' : 'success'}>{e.entryType}</Badge>,
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (e) => <span style={{ fontWeight: 600, color: e.entryType === 'DEBIT' ? 'var(--peg-danger)' : 'var(--peg-success)' }}>{formatBRL(e.amountCents)}</span>,
    },
    {
      key: 'reference',
      header: 'Referência',
      render: (e) => (
        <span className="peg-text-mono peg-text-tertiary" style={{ fontSize: 11 }}>
          {e.referenceType}:{e.referenceId.slice(0, 8)}
        </span>
      ),
    },
    { key: 'desc', header: 'Descrição', render: (e) => <span className="peg-text-secondary">{e.description ?? '—'}</span> },
    { key: 'when', header: 'Quando', render: (e) => <span className="peg-text-tertiary">{formatDateTime(e.createdAt)}</span> },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Ledger"
        description="Partidas de dupla entrada — auditável e imutável."
        filters={
          <Select
            size="sm"
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); }}
            placeholder="Todas as contas"
            options={(accountsQ.data?.accounts ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
            aria-label="Filtrar por conta"
          />
        }
      />

      <div className="peg-grid cols-3">
        <Card title="Débitos" padless>
          <div style={{ padding: 16, fontSize: 20, fontWeight: 700, color: 'var(--peg-danger)' }}>{formatBRL(balance.debits)}</div>
        </Card>
        <Card title="Créditos" padless>
          <div style={{ padding: 16, fontSize: 20, fontWeight: 700, color: 'var(--peg-success)' }}>{formatBRL(balance.credits)}</div>
        </Card>
        <Card title="Saldo (débito − crédito)" padless>
          <div style={{ padding: 16, fontSize: 20, fontWeight: 700 }}>{formatBRL(balance.net)}</div>
        </Card>
      </div>

      <DataTable
        columns={columns}
        rows={entriesQ.data?.entries ?? []}
        loading={entriesQ.loading}
        dense
        emptyTitle="Nenhuma partida"
        emptyBody="As transações financeiras geram partidas automaticamente."
      />
      {entriesQ.error ? <ErrorState body={entriesQ.error} onRetry={entriesQ.reload} /> : null}
    </div>
  );
}

export function LedgerClient() {
  return <LedgerBody />;
}
