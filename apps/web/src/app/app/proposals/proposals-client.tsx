'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  Icon,
  Input,
  Modal,
  Select,
  Stack,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Proposal {
  id: string;
  leadId: string | null;
  partyId: string | null;
  propertyId: string | null;
  status: string;
  monthlyRentCents: number;
  terms: string | null;
  validUntil: string | null;
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

function ProposalsBody() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/proposals?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ proposals: Proposal[]; total: number }>(queryPath, [queryPath]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', []);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', []);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a propostas" />;

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

  const detail = detailId ? data?.proposals.find((p) => p.id === detailId) ?? null : null;

  const columns: Column<Proposal>[] = [
    {
      key: 'party',
      header: 'Interessado',
      render: (p) => <span style={{ fontWeight: 500 }}>{partyMap.get(p.partyId ?? '')?.name ?? '—'}</span>,
    },
    {
      key: 'property',
      header: 'Imóvel',
      render: (p) => <span className="peg-text-secondary">{propertyMap.get(p.propertyId ?? '')?.title ?? '—'}</span>,
    },
    {
      key: 'rent',
      header: 'Aluguel proposto',
      render: (p) => <span style={{ fontWeight: 600 }}>{formatBRL(p.monthlyRentCents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge tone={PROPOSAL_STATUS_TONES[p.status] ?? 'neutral'}>{label(PROPOSAL_STATUS_LABELS, p.status)}</Badge>,
    },
    { key: 'valid', header: 'Válida até', render: (p) => <span className="peg-text-tertiary">{formatDate(p.validUntil)}</span> },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Propostas"
        description="Negociações de locação por imóvel."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(PROPOSAL_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar propostas"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Nova proposta
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.proposals ?? []}
        loading={loading}
        onRowClick={(p) => { setDetailId(p.id); }}
        emptyTitle="Nenhuma proposta"
        emptyBody="Crie propostas para os leads qualificados."
        emptyActionLabel="Nova proposta"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <Drawer
        open={detail !== null}
        onClose={() => { setDetailId(null); }}
        title="Detalhe da proposta"
        footer={
          <Button variant="secondary" onClick={() => { setDetailId(null); }}>
            Fechar
          </Button>
        }
      >
        {detail ? (
          <Stack gap={4}>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Interessado</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{partyMap.get(detail.partyId ?? '')?.name ?? '—'}</span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Imóvel</span>
              <span style={{ fontSize: 14 }}>{propertyMap.get(detail.propertyId ?? '')?.title ?? '—'}</span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aluguel proposto</span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{formatBRL(detail.monthlyRentCents)}/mês</span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</span>
              <Badge tone={PROPOSAL_STATUS_TONES[detail.status] ?? 'neutral'}>{label(PROPOSAL_STATUS_LABELS, detail.status)}</Badge>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Condições</span>
              <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{detail.terms ?? '—'}</span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Válida até</span>
              <span style={{ fontSize: 13 }}>{formatDate(detail.validUntil)}</span>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      <CreateProposalModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        properties={propsQ.data?.properties ?? []}
        onCreated={() => {
          toast.success('Proposta criada');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateProposalModal({
  open,
  onClose,
  properties,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  properties: Property[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [propertyId, setPropertyId] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [terms, setTerms] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const rentCents = Math.round(parseFloat(monthlyRent.replace(',', '.')) * 100);
    if (!propertyId || !Number.isFinite(rentCents) || rentCents <= 0) {
      toast.error('Informe o imóvel e um aluguel válido');
      return;
    }
    setBusy(true);
    try {
      const body: { propertyId: string; monthlyRentCents: number; terms?: string; validUntil?: string } = {
        propertyId,
        monthlyRentCents: rentCents,
      };
      if (terms.trim()) body.terms = terms.trim();
      if (validUntil) body.validUntil = new Date(validUntil).toISOString();
      await apiClient('/proposals', { method: 'POST', body });
      setPropertyId('');
      setMonthlyRent('');
      setTerms('');
      setValidUntil('');
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
      title="Nova proposta"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-proposal-form" loading={busy}>Criar</Button>
        </>
      }
    >
      <form id="create-proposal-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Select
          label="Imóvel"
          required
          value={propertyId}
          onChange={(e) => { setPropertyId(e.target.value); }}
          placeholder="Selecione o imóvel…"
          options={properties.map((p) => ({ value: p.id, label: p.title }))}
        />
        <Input label="Aluguel mensal (R$)" required inputMode="decimal" value={monthlyRent} onChange={(e) => { setMonthlyRent(e.target.value); }} placeholder="3.500" />
        <Textarea label="Condições" optional rows={3} value={terms} onChange={(e) => { setTerms(e.target.value); }} placeholder="Ex.: caução de 1 mês, contrato 12 meses…" />
        <Input label="Válida até" type="date" optional value={validUntil} onChange={(e) => { setValidUntil(e.target.value); }} />
      </form>
    </Modal>
  );
}

export function ProposalsClient() {
  return (
    <ToastProvider>
      <ProposalsBody />
    </ToastProvider>
  );
}
