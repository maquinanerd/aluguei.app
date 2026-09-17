'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, DataTable, ErrorState, Pagination, Stack, Tabs } from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { PageToolbar } from '@/components/page-toolbar';
import { useQuery } from '@/lib/use-query';
import { ORGANIZATION_STATUS_LABELS, formatDocument } from '@/lib/account-status';
import type { OrganizationStatus } from '@/lib/account-status';
import { ORGANIZATION_STATUS_TONES, limitFor, usageLabel } from '@/lib/platform';
import type { PlatformOrganization, PlatformOrganizationList } from '@/lib/platform';

const PAGE_SIZE = 50;

export type StatusFilter = 'ALL' | OrganizationStatus;

const FILTERS: readonly StatusFilter[] = [
  'ALL',
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function OrganizationStatusBadge({ status }: { status: OrganizationStatus }) {
  return (
    <Badge tone={ORGANIZATION_STATUS_TONES[status]}>{ORGANIZATION_STATUS_LABELS[status]}</Badge>
  );
}

export const organizationColumns: Column<PlatformOrganization>[] = [
  {
    key: 'name',
    header: 'Imobiliária',
    render: (org) => (
      <Stack gap={0}>
        <Link href={`/plataforma/imobiliarias/${org.id}`} style={{ fontWeight: 500 }}>
          {org.name}
        </Link>
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          {formatDocument(org.document)}
        </span>
      </Stack>
    ),
  },
  {
    key: 'owner',
    header: 'Responsável',
    render: (org) =>
      org.owner ? (
        <Stack gap={0}>
          <span>{org.owner.name}</span>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            {org.owner.email}
          </span>
        </Stack>
      ) : (
        '—'
      ),
  },
  {
    key: 'plan',
    header: 'Plano',
    render: (org) => (
      <Stack gap={1}>
        <span>{org.plan.name}</span>
        {org.overLimit.length > 0 ? <Badge tone="danger">Acima do limite</Badge> : null}
      </Stack>
    ),
  },
  {
    key: 'usage',
    header: 'Imóveis · anúncios · usuários',
    render: (org) => (
      <span style={{ fontSize: 13 }}>
        {usageLabel(org.usage.properties, limitFor(org.plan, 'properties'))} ·{' '}
        {usageLabel(org.usage.publishedListings, limitFor(org.plan, 'publishedListings'))} ·{' '}
        {usageLabel(org.usage.users, limitFor(org.plan, 'users'))}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Situação',
    render: (org) => <OrganizationStatusBadge status={org.status} />,
  },
  {
    key: 'createdAt',
    header: 'Cadastro',
    render: (org) => formatDate(org.createdAt),
  },
];

export function OrganizationsClient({ initialStatus }: { initialStatus: StatusFilter }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  // limit literal (guarda P1-01 do web): igual a PAGE_SIZE.
  const params = new URLSearchParams({ limit: '50', offset: String(page * PAGE_SIZE) });
  if (status !== 'ALL') params.set('status', status);
  if (query) params.set('q', query);
  const list = useQuery<PlatformOrganizationList>(`/platform/organizations?${params.toString()}`);

  const counts = list.data?.counts;
  const tabs = FILTERS.map((filter) => ({
    value: filter,
    label: filter === 'ALL' ? 'Todas' : ORGANIZATION_STATUS_LABELS[filter],
    ...(counts
      ? {
          count:
            filter === 'ALL'
              ? Object.values(counts).reduce((sum, n) => sum + n, 0)
              : counts[filter],
        }
      : {}),
  }));

  return (
    <div className="app-page">
      <PageToolbar
        title="Imobiliárias"
        description="Cadastros do cadastro aberto, situação e plano de cada imobiliária."
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Buscar por nome, e-mail do responsável ou CNPJ…',
        }}
      />
      <Tabs
        items={tabs}
        value={status}
        onChange={(value) => {
          setStatus(value as StatusFilter);
          setPage(0);
        }}
      />
      <DataTable
        columns={organizationColumns}
        rows={list.data?.organizations ?? []}
        loading={list.loading}
        emptyTitle="Nenhuma imobiliária"
        emptyBody="Nenhum cadastro com esse filtro."
        onRowClick={(org) => {
          router.push(`/plataforma/imobiliarias/${org.id}`);
        }}
      />
      {list.error ? <ErrorState body={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.total > PAGE_SIZE ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data.total}
          onPageChange={setPage}
          disabled={list.loading}
        />
      ) : null}
    </div>
  );
}
