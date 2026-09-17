'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AsyncCombobox,
  Badge,
  Button,
  DataTable,
  Group,
  Icon,
  Input,
  Modal,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column, ComboboxOption } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { searchProperties, useLookup } from '@/lib/lookup';
import { label, LISTING_STATUS_LABELS, LISTING_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Listing {
  id: string;
  propertyId: string;
  status: string;
  title: string;
  description: string | null;
  slug: string;
  publishedAt: string | null;
  createdAt: string;
}

interface Property {
  id: string;
  title: string;
  status: string;
}

function ListingsBody() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/listings?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{
    listings: Listing[];
    total: number;
  }>(queryPath, [queryPath]);
  // Imóvel das linhas da página, por `ids` (antes limit=200 → 400 — P1-01).
  const propertyLookup = useLookup<Property>(
    'properties',
    (data?.listings ?? []).map((l) => l.propertyId),
  );

  const propertyTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of propertyLookup.map.values()) m.set(p.id, p.title);
    return m;
  }, [propertyLookup.map]);

  const listings = useMemo(() => {
    const rows = data?.listings ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((l) => l.title.toLowerCase().includes(q));
  }, [data, search]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a listings" />;

  async function changeStatus(listing: Listing, next: string) {
    setBusy(listing.id);
    try {
      await apiClient(`/listings/${listing.id}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      toast.success('Status atualizado', label(LISTING_STATUS_LABELS, next));
      reload();
    } catch (err) {
      toast.error('Falha', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<Listing>[] = [
    {
      key: 'title',
      header: 'Anúncio',
      sortable: true,
      render: (l) => (
        <Stack gap={0}>
          <span style={{ fontWeight: 500 }}>{l.title}</span>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            /{l.slug}
          </span>
        </Stack>
      ),
    },
    {
      key: 'property',
      header: 'Imóvel',
      render: (l) => (
        <span className="peg-text-secondary">{propertyTitle.get(l.propertyId) ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) => (
        <Badge tone={LISTING_STATUS_TONES[l.status] ?? 'neutral'}>
          {label(LISTING_STATUS_LABELS, l.status)}
        </Badge>
      ),
    },
    {
      key: 'published',
      header: 'Publicado em',
      render: (l) => <span className="peg-text-tertiary">{formatDate(l.publishedAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (l) => (
        <Group gap={1}>
          {l.status === 'DRAFT' || l.status === 'PAUSED' ? (
            <Button
              size="xs"
              variant="secondary"
              loading={busy === l.id}
              onClick={() => {
                void changeStatus(l, 'READY');
              }}
            >
              Pronto
            </Button>
          ) : null}
          {l.status === 'READY' ? (
            <Button
              size="xs"
              variant="brand"
              loading={busy === l.id}
              onClick={() => {
                void changeStatus(l, 'PUBLISHED');
              }}
            >
              Publicar
            </Button>
          ) : null}
          {l.status === 'PUBLISHED' ? (
            <Button
              size="xs"
              variant="tertiary"
              loading={busy === l.id}
              onClick={() => {
                void changeStatus(l, 'PAUSED');
              }}
            >
              Pausar
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="tertiary"
            onClick={() => {
              router.push(`/app/properties/${l.propertyId}`);
            }}
          >
            Imóvel
          </Button>
        </Group>
      ),
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Listings"
        description="Anúncios por imóvel e distribuição para canais."
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar anúncio…' }}
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(LISTING_STATUS_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            }))}
            aria-label="Filtrar por status"
          />
        }
        actions={
          <Button
            variant="brand"
            size="sm"
            icon={<Icon name="plus" size={14} />}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Novo listing
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={listings}
        loading={loading}
        onRowClick={(l) => {
          router.push(`/app/properties/${l.propertyId}`);
        }}
        emptyTitle="Nenhum listing"
        emptyBody="Crie um anúncio para publicar o imóvel."
        emptyActionLabel="Novo listing"
        onEmptyAction={() => {
          setCreateOpen(true);
        }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreateListingModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        onCreated={() => {
          toast.success('Listing criado');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateListingModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  // Imóvel buscado no servidor: o select com limit=200 ficava vazio (P1-01).
  const [property, setProperty] = useState<ComboboxOption | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!property || !title.trim()) return;
    setBusy(true);
    try {
      const body: { propertyId: string; title: string; description?: string } = {
        propertyId: property.value,
        title: title.trim(),
      };
      if (description.trim()) body.description = description.trim();
      await apiClient('/listings', { method: 'POST', body });
      setProperty(null);
      setTitle('');
      setDescription('');
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
      title="Novo listing"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-listing-form" loading={busy}>
            Criar
          </Button>
        </>
      }
    >
      <form
        id="create-listing-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <AsyncCombobox
          label="Imóvel"
          required
          value={property}
          onChange={setProperty}
          loadOptions={searchProperties}
          placeholder="Buscar imóvel pelo título…"
        />
        <Input
          label="Título do anúncio"
          required
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          placeholder="Ex.: Apartamento na Paulista"
        />
        <Input
          label="Descrição"
          optional
          placeholder="Texto do anúncio…"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </form>
    </Modal>
  );
}

export function ListingsClient() {
  return (
    <ToastProvider>
      <ListingsBody />
    </ToastProvider>
  );
}
