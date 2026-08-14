'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  Group,
  Icon,
  Select,
  SegmentedControl,
  Stack,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { label, PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Property {
  id: string;
  title: string;
  propertyType: string;
  status: string;
  totalAreaSqm: number | null;
  builtAreaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
  createdAt: string;
}

function PropertiesBody() {
  const router = useRouter();
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/properties?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ properties: Property[]; total: number }>(
    queryPath,
    [queryPath],
  );

  if (permissionDenied) return <PermissionDenied title="Sem acesso a imóveis" />;

  const properties = useMemo(() => {
    const rows = data?.properties ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => p.title.toLowerCase().includes(q));
  }, [data, search]);

  const columns: Column<Property>[] = [
    {
      key: 'title',
      header: 'Imóvel',
      sortable: true,
      render: (p) => (
        <Stack gap={0}>
          <span style={{ fontWeight: 500 }}>{p.title}</span>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            {label(PROPERTY_TYPE_LABELS, p.propertyType)}
            {p.bedrooms !== null ? ` · ${String(p.bedrooms)} dorm.` : ''}
            {p.bathrooms !== null ? ` · ${String(p.bathrooms)} ban.` : ''}
            {p.totalAreaSqm !== null ? ` · ${String(p.totalAreaSqm)} m²` : ''}
          </span>
        </Stack>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{label(PROPERTY_STATUS_LABELS, p.status)}</Badge>
      ),
    },
    {
      key: 'features',
      header: 'Características',
      render: (p) => (
        <span className="peg-text-secondary">
          {p.furnished ? 'Mobiliado' : 'Vazio'}
          {p.petsAllowed === true ? ' · aceita pets' : p.petsAllowed === false ? ' · sem pets' : ''}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Criado em',
      render: (p) => <span className="peg-text-tertiary">{formatDate(p.createdAt)}</span>,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Imóveis"
        description="Portfólio de imóveis para locação."
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar imóvel…' }}
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(PROPERTY_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar por status"
          />
        }
        actions={
          <Group gap={2}>
            <SegmentedControl
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'table', label: 'Tabela' },
                { value: 'grid', label: 'Grade' },
              ]}
            />
            <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { router.push('/app/properties/new'); }}>
              Novo imóvel
            </Button>
          </Group>
        }
      />

      {view === 'table' ? (
        <DataTable
          columns={columns}
          rows={properties}
          loading={loading}
          selectedIds={selected}
          onSelectIds={setSelected}
          onRowClick={(p) => { router.push(`/app/properties/${p.id}`); }}
          emptyTitle="Nenhum imóvel"
          emptyBody="Cadastre o primeiro imóvel do portfólio."
          emptyActionLabel="Novo imóvel"
          onEmptyAction={() => { router.push('/app/properties/new'); }}
        />
      ) : (
        <div className="peg-grid cols-3">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { router.push(`/app/properties/${p.id}`); }}
              className="peg-card"
              style={{
                padding: 16,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <Group between>
                <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{label(PROPERTY_STATUS_LABELS, p.status)}</Badge>
                <Icon name="home" size={16} />
              </Group>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</span>
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                {label(PROPERTY_TYPE_LABELS, p.propertyType)}
                {p.bedrooms !== null ? ` · ${String(p.bedrooms)} dorm.` : ''}
                {p.bathrooms !== null ? ` · ${String(p.bathrooms)} ban.` : ''}
                {p.totalAreaSqm !== null ? ` · ${String(p.totalAreaSqm)} m²` : ''}
              </span>
              <span className="peg-text-secondary" style={{ fontSize: 12 }}>
                {p.furnished ? 'Mobiliado' : 'Vazio'}
                {p.petsAllowed === true ? ' · pets OK' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {error ? <ErrorState body={error} onRetry={reload} /> : null}
    </div>
  );
}

export function PropertiesClient() {
  return <PropertiesBody />;
}
