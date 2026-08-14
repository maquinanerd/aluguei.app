'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  Group,
  Icon,
  Pagination,
  SegmentedControl,
  Stack,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { label, PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/labels';
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

type Tab = 'ALL' | 'ACTIVE' | 'ARCHIVED';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'Disponíveis' },
  { value: 'ARCHIVED', label: 'Arquivados' },
];

function PropertiesBody() {
  const router = useRouter();
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('ALL');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (tab !== 'ALL') params.set('status', tab);
    return `/properties?${params.toString()}`;
  }, [page, tab]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ properties: Property[]; total: number }>(
    queryPath,
    [queryPath],
  );

  // Contagens reais para o header (mockup: "N imóveis · X disponíveis")
  const allQuery = useQuery<{ properties: Property[]; total: number }>('/properties?limit=1', ['props-total']);
  const activeQuery = useQuery<{ properties: Property[]; total: number }>('/properties?limit=1&status=ACTIVE', ['props-active']);
  const totalCount = allQuery.data?.total ?? data?.total ?? 0;
  const activeCount = activeQuery.data?.total ?? null;

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
        <div className="prop-cell">
          <span className="prop-thumb" aria-hidden="true">
            <Icon name="home" size={16} />
          </span>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <span className="prop-title">{p.title}</span>
            <span className="prop-sub">
              <span className="prop-code">{p.id.slice(0, 8).toUpperCase()}</span>
              {' · '}
              {label(PROPERTY_TYPE_LABELS, p.propertyType)}
              {p.bedrooms !== null ? ` · ${String(p.bedrooms)} dorm.` : ''}
              {p.totalAreaSqm !== null ? ` · ${String(p.totalAreaSqm)} m²` : ''}
            </span>
          </Stack>
        </div>
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
      header: 'Configuração',
      render: (p) => (
        <span className="prop-sub">
          {p.furnished ? 'Mobiliado' : 'Vazio'}
          {p.petsAllowed === true ? ' · pets OK' : p.petsAllowed === false ? ' · sem pets' : ''}
          {p.bathrooms !== null ? ` · ${String(p.bathrooms)} ban.` : ''}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Criado em',
      render: (p) => <span className="peg-text-tertiary">{formatDate(p.createdAt)}</span>,
    },
    {
      key: 'menu',
      header: '',
      headerClassName: 'prop-menu-col',
      cellClassName: 'prop-menu-col',
      render: (p) => (
        <span className="peg-group" style={{ gap: 4 }}>
          <button
            type="button"
            className="peg-icon-btn peg-icon-btn--sm"
            aria-label={`Ver ${p.title}`}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/app/properties/${p.id}`);
            }}
          >
            <Icon name="moreHorizontal" size={16} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="app-page">
      {/* Header com contagens (mockup) */}
      <div className="peg-group between" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div className="peg-stack" style={{ gap: 2 }}>
          <h1 className="app-page__title">Imóveis</h1>
          <p className="app-page__desc">
            {totalCount} {totalCount === 1 ? 'imóvel' : 'imóveis'}
            {activeCount !== null ? ` · ${activeCount} disponíveis` : ''}
          </p>
        </div>
        <Group gap={8}>
          <SegmentedControl
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'table', label: 'Lista' },
              { value: 'grid', label: 'Grade' },
            ]}
          />
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { router.push('/app/properties/new'); }}>
            Novo imóvel
          </Button>
        </Group>
      </div>

      {/* Tabs de status */}
      <div className="peg-tabs" role="tablist" aria-label="Filtrar por status">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={tab === t.value ? 'peg-tab peg-tab--active' : 'peg-tab'}
            onClick={() => {
              setTab(t.value);
              setPage(0);
              setSelected(new Set());
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Busca + filtros aplicados */}
      <div className="peg-group" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label className="peg-input peg-input--md prop-search" aria-label="Buscar imóvel">
          <span className="peg-input__prefix"><Icon name="search" size={15} /></span>
          <input
            type="text"
            className="peg-input__control"
            placeholder="Buscar imóvel…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
          />
        </label>
        {tab !== 'ALL' ? (
          <button type="button" className="peg-tag" onClick={() => { setTab('ALL'); setPage(0); }} aria-label="Remover filtro de status">
            Status: {TABS.find((t) => t.value === tab)?.label}
            <span className="peg-tag__remove"><Icon name="x" size={12} /></span>
          </button>
        ) : null}
      </div>

      {view === 'table' ? (
        <>
          <DataTable
            columns={columns}
            rows={properties}
            loading={loading}
            dense
            selectedIds={selected}
            onSelectIds={setSelected}
            onRowClick={(p) => { router.push(`/app/properties/${p.id}`); }}
            emptyTitle="Nenhum imóvel"
            emptyBody="Cadastre o primeiro imóvel do portfólio."
            emptyActionLabel="Novo imóvel"
            onEmptyAction={() => { router.push('/app/properties/new'); }}
          />
          <Pagination page={page} pageSize={50} total={data?.total ?? 0} onPageChange={setPage} />
        </>
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
                <span className="prop-code">{p.id.slice(0, 8).toUpperCase()}</span>
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
