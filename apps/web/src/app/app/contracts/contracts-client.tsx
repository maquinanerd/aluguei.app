'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  Group,
  Icon,
  Modal,
  Select,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Contract {
  id: string;
  templateId: string | null;
  applicationId: string | null;
  status: string;
  content: string | null;
  contentHash: string | null;
  signedAt: string | null;
  createdAt: string;
}

interface Application {
  id: string;
  partyId: string;
  propertyId: string;
  status: string;
}

interface Template {
  id: string;
  name: string;
  status: string;
}

interface Party {
  id: string;
  name: string;
}

function ContractsBody() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/contracts?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ contracts: Contract[]; total: number }>(queryPath, [queryPath]);
  const appsQ = useQuery<{ applications: Application[]; total: number }>('/rental-applications?limit=200', []);
  const templatesQ = useQuery<{ templates: Template[]; total: number }>('/contract-templates?limit=100', []);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', []);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a contratos" />;

  const partyMap = useMemo(() => {
    const m = new Map<string, Party>();
    for (const p of partiesQ.data?.parties ?? []) m.set(p.id, p);
    return m;
  }, [partiesQ.data]);

  const appMap = useMemo(() => {
    const m = new Map<string, Application>();
    for (const a of appsQ.data?.applications ?? []) m.set(a.id, a);
    return m;
  }, [appsQ.data]);

  const templateMap = useMemo(() => {
    const m = new Map<string, Template>();
    for (const t of templatesQ.data?.templates ?? []) m.set(t.id, t);
    return m;
  }, [templatesQ.data]);

  const columns: Column<Contract>[] = [
    {
      key: 'party',
      header: 'Locatário',
      render: (c) => {
        const app = c.applicationId ? appMap.get(c.applicationId) : null;
        const name = app ? partyMap.get(app.partyId)?.name : null;
        return <span style={{ fontWeight: 500 }}>{name ?? '—'}</span>;
      },
    },
    {
      key: 'template',
      header: 'Template',
      render: (c) => <span className="peg-text-secondary">{c.templateId ? templateMap.get(c.templateId)?.name ?? '—' : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge tone={CONTRACT_STATUS_TONES[c.status] ?? 'neutral'}>{label(CONTRACT_STATUS_LABELS, c.status)}</Badge>,
    },
    { key: 'signed', header: 'Assinado em', render: (c) => <span className="peg-text-tertiary">{formatDate(c.signedAt)}</span> },
    { key: 'created', header: 'Criado em', render: (c) => <span className="peg-text-tertiary">{formatDate(c.createdAt)}</span> },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Contratos"
        description="Contratos de locação e ciclo de assinatura."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(CONTRACT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar contratos"
          />
        }
        actions={
          <Group gap={2}>
            <Button size="sm" variant="secondary" icon={<Icon name="fileText" size={14} />} onClick={() => { router.push('/app/contract-templates'); }}>
              Templates
            </Button>
            <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
              Novo contrato
            </Button>
          </Group>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.contracts ?? []}
        loading={loading}
        onRowClick={(c) => { router.push(`/app/contracts/${c.id}`); }}
        emptyTitle="Nenhum contrato"
        emptyBody="Crie um contrato a partir de uma aplicação aprovada."
        emptyActionLabel="Novo contrato"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreateContractModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        applications={appsQ.data?.applications ?? []}
        templates={templatesQ.data?.templates ?? []}
        onCreated={() => {
          toast.success('Contrato criado');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateContractModal({
  open,
  onClose,
  applications,
  templates,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  applications: Application[];
  templates: Template[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [applicationId, setApplicationId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!applicationId || !templateId) return;
    setBusy(true);
    try {
      await apiClient('/contracts', { method: 'POST', body: { applicationId, templateId } });
      setApplicationId('');
      setTemplateId('');
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
      title="Novo contrato"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-contract-form" loading={busy}>Criar</Button>
        </>
      }
    >
      <form id="create-contract-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Select
          label="Aplicação aprovada"
          required
          value={applicationId}
          onChange={(e) => { setApplicationId(e.target.value); }}
          placeholder="Selecione a aplicação…"
          options={applications
            .filter((a) => a.status === 'APPROVED' || a.status === 'CONTRACTING')
            .map((a) => ({ value: a.id, label: `${a.id.slice(0, 8)} · ${a.status}` }))}
        />
        <Select
          label="Template"
          required
          value={templateId}
          onChange={(e) => { setTemplateId(e.target.value); }}
          placeholder="Selecione o template…"
          options={templates.filter((t) => t.status === 'APPROVED').map((t) => ({ value: t.id, label: t.name }))}
        />
        <p className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Somente templates aprovados podem ser usados.
        </p>
      </form>
    </Modal>
  );
}

export function ContractsClient() {
  return (
    <ToastProvider>
      <ContractsBody />
    </ToastProvider>
  );
}
