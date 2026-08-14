'use client';

import { useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Group,
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
import { formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, TASK_STATUS_LABELS } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  assigneeUserId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
}

function TasksBody() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (status) params.set('status', status);
    return `/tasks?${params.toString()}`;
  }, [status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{ tasks: Task[]; total: number }>(queryPath, [queryPath]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a tarefas" />;

  const tasks = useMemo(() => {
    const rows = data?.tasks ?? [];
    const q = search.trim().toLowerCase();
    return q ? rows.filter((t) => t.title.toLowerCase().includes(q)) : rows;
  }, [data, search]);

  async function setTaskStatus(task: Task, next: string) {
    try {
      await apiClient(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status: next } });
      toast.success('Tarefa atualizada', label(TASK_STATUS_LABELS, next));
      reload();
    } catch (err) {
      toast.error('Falha ao atualizar', err instanceof Error ? err.message : undefined);
    }
  }

  const columns: Column<Task>[] = [
    {
      key: 'done',
      header: '',
      render: (t) =>
        t.status === 'OPEN' ? (
          <Checkbox checked={false} aria-label={`Concluir ${t.title}`} onChange={() => void setTaskStatus(t, 'DONE')} ref={undefined} />
        ) : t.status === 'DONE' ? (
          <Icon name="checkCircle" size={16} />
        ) : null,
    },
    {
      key: 'title',
      header: 'Tarefa',
      sortable: true,
      render: (t) => (
        <Stack gap={0}>
          <span style={{ fontWeight: 500, textDecoration: t.status === 'DONE' ? 'line-through' : undefined }}>{t.title}</span>
          {t.description ? <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{t.description}</span> : null}
        </Stack>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <Badge tone={t.status === 'DONE' ? 'success' : t.status === 'CANCELLED' ? 'neutral' : 'info'}>
          {label(TASK_STATUS_LABELS, t.status)}
        </Badge>
      ),
    },
    { key: 'due', header: 'Vencimento', render: (t) => <span className="peg-text-secondary">{formatDateTime(t.dueAt)}</span> },
    {
      key: 'actions',
      header: '',
      render: (t) => (
        <Group gap={1}>
          {t.status === 'OPEN' ? (
            <Button size="xs" variant="tertiary" onClick={() => void setTaskStatus(t, 'DONE')}>
              Concluir
            </Button>
          ) : null}
          {t.status !== 'CANCELLED' ? (
            <Button size="xs" variant="tertiary" onClick={() => void setTaskStatus(t, 'CANCELLED')}>
              Cancelar
            </Button>
          ) : null}
        </Group>
      ),
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Tarefas"
        description="Próximas ações da equipe."
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar tarefa…' }}
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); }}
            placeholder="Todas"
            options={Object.entries(TASK_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar por status"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Nova tarefa
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={tasks}
        loading={loading}
        emptyTitle="Nenhuma tarefa"
        emptyBody="Crie uma tarefa para acompanhar a equipe."
        emptyActionLabel="Nova tarefa"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreateTaskModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        onCreated={() => {
          toast.success('Tarefa criada');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateTaskModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: SyntheticEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const body: { title: string; description?: string; dueAt?: string } = { title: title.trim() };
      if (description.trim()) body.description = description.trim();
      if (dueAt) body.dueAt = new Date(dueAt).toISOString();
      await apiClient('/tasks', { method: 'POST', body });
      setTitle('');
      setDescription('');
      setDueAt('');
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
      title="Nova tarefa"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-task-form" loading={busy}>Criar</Button>
        </>
      }
    >
      <form id="create-task-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Input label="Título" required value={title} onChange={(e) => { setTitle(e.target.value); }} placeholder="Ex.: Ligar para o proprietário" />
        <Textarea label="Descrição" optional rows={3} value={description} onChange={(e) => { setDescription(e.target.value); }} />
        <Input label="Vencimento" type="datetime-local" optional value={dueAt} onChange={(e) => { setDueAt(e.target.value); }} />
      </form>
    </Modal>
  );
}

export function TasksClient() {
  return (
    <ToastProvider>
      <TasksBody />
    </ToastProvider>
  );
}
