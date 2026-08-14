'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  DataTable,
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
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Template {
  id: string;
  name: string;
  version: number;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  APPROVED: 'Aprovado',
  ARCHIVED: 'Arquivado',
};

const STATUS_TONES: Record<string, 'neutral' | 'success' | 'info'> = {
  DRAFT: 'neutral',
  APPROVED: 'success',
  ARCHIVED: 'info',
};

function TemplatesBody() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (status) params.set('status', status);
    return `/contract-templates?${params.toString()}`;
  }, [status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ templates: Template[]; total: number }>(queryPath, [queryPath]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a templates" />;

  const templates = useMemo(() => {
    const rows = data?.templates ?? [];
    const q = search.trim().toLowerCase();
    return q ? rows.filter((t) => t.name.toLowerCase().includes(q)) : rows;
  }, [data, search]);

  async function approve(t: Template) {
    try {
      await apiClient(`/contract-templates/${t.id}/approve`, { method: 'PATCH' });
      toast.success('Template aprovado');
      reload();
    } catch (err) {
      toast.error('Falha ao aprovar', err instanceof Error ? err.message : undefined);
    }
  }

  const columns: Column<Template>[] = [
    {
      key: 'name',
      header: 'Template',
      sortable: true,
      render: (t) => (
        <Stack gap={0}>
          <span style={{ fontWeight: 500 }}>{t.name}</span>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>versão {String(t.version)}</span>
        </Stack>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <Badge tone={STATUS_TONES[t.status] ?? 'neutral'}>{STATUS_LABELS[t.status] ?? t.status}</Badge>,
    },
    {
      key: 'approved',
      header: 'Aprovado em',
      render: (t) => <span className="peg-text-tertiary">{formatDate(t.approvedAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (t) =>
        t.status === 'DRAFT' ? (
          <Button size="xs" variant="brand" onClick={() => { void approve(t); }}>
            Aprovar
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Templates de contrato"
        description="Modelos versionados e aprovados de contrato."
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar template…' }}
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); }}
            placeholder="Todos"
            options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar templates"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Novo template
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={templates}
        loading={loading}
        emptyTitle="Nenhum template"
        emptyBody="Crie um template de contrato para agilizar a contratação."
        emptyActionLabel="Novo template"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreateTemplateModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        onCreated={() => {
          toast.success('Template criado');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateTemplateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await apiClient('/contract-templates', { method: 'POST', body: { name: name.trim(), body: body.trim() } });
      setName('');
      setBody('');
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
      title="Novo template de contrato"
      size="lg"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-template-form" loading={busy}>Criar</Button>
        </>
      }
    >
      <form id="create-template-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Input label="Nome" required value={name} onChange={(e) => { setName(e.target.value); }} placeholder="Ex.: Locação residencial padrão" />
        <Textarea label="Corpo do contrato" required rows={12} value={body} onChange={(e) => { setBody(e.target.value); }} placeholder={"{{nome_locatario}} aluga de {{nome_proprietario}}…"} />
        <p className="peg-text-tertiary" style={{ fontSize: 12 }}>
          O corpo usa variáveis de template preenchidas no momento da geração.
        </p>
      </form>
    </Modal>
  );
}

export function ContractTemplatesClient() {
  return (
    <ToastProvider>
      <TemplatesBody />
    </ToastProvider>
  );
}
