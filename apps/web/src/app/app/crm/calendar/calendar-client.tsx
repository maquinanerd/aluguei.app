'use client';

import { useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Icon,
  Input,
  Modal,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, VISIT_STATUS_LABELS, VISIT_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, EmptyState } from '@aluguei/ui';

interface Visit {
  id: string;
  leadId: string | null;
  partyId: string | null;
  propertyId: string | null;
  scheduledAt: string;
  status: string;
  note: string | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
}

interface Property {
  id: string;
  title: string;
}

/** Agrupa visitas por dia (local date). */
function groupByDay(visits: Visit[]): Array<{ day: string; items: Visit[] }> {
  const map = new Map<string, Visit[]>();
  for (const v of visits) {
    const key = new Date(v.scheduledAt).toISOString().slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(v);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    }));
}

function CalendarBody() {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (statusFilter) params.set('status', statusFilter);
    return `/visits?${params.toString()}`;
  }, [statusFilter]);

  const visitsQ = useQuery<{ visits: Visit[]; total: number }>(queryPath, [queryPath]);
  const tasksQ = useQuery<{ tasks: Task[]; total: number }>('/tasks?limit=50&status=OPEN', []);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=100', []);

  if (visitsQ.permissionDenied) return <PermissionDenied title="Sem acesso à agenda" />;

  const propertyTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of propsQ.data?.properties ?? []) map.set(p.id, p.title);
    return map;
  }, [propsQ.data]);

  const days = groupByDay(visitsQ.data?.visits ?? []);
  const openTasks = (tasksQ.data?.tasks ?? []).filter((t) => t.status === 'OPEN');

  return (
    <div className="app-page">
      <PageToolbar
        title="Agenda"
        description="Visitas e atividades do time."
        filters={
          <Select
            size="sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); }}
            placeholder="Todos os status"
            options={Object.entries(VISIT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar visitas"
          />
        }
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Agendar visita
          </Button>
        }
      />

      <div className="peg-grid cols-2" style={{ alignItems: 'start' }}>
        <Stack gap={3}>
          {visitsQ.loading ? (
            <EmptyState title="Carregando agenda…" icon="calendar" />
          ) : days.length === 0 ? (
            <EmptyState title="Nenhuma visita" body="Agende visitas para os interessados nos imóveis." />
          ) : (
            days.map((day) => (
              <Card key={day.day} padless>
                <header className="peg-card__header">
                  <h3 className="peg-card__title">{formatDayLabel(day.day)}</h3>
                  <Badge tone="neutral">{day.items.length}</Badge>
                </header>
                <Stack gap={0}>
                  {day.items.map((v) => (
                    <Group key={v.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 48 }}>
                        {formatTime(v.scheduledAt)}
                      </span>
                      <span className="peg-grow peg-truncate" style={{ fontSize: 13 }}>
                        {propertyTitle.get(v.propertyId ?? '') ?? 'Imóvel não informado'}
                      </span>
                      <Badge tone={VISIT_STATUS_TONES[v.status] ?? 'neutral'}>{label(VISIT_STATUS_LABELS, v.status)}</Badge>
                    </Group>
                  ))}
                </Stack>
              </Card>
            ))
          )}
        </Stack>

        <Stack gap={3}>
          <Card padless>
            <header className="peg-card__header">
              <h3 className="peg-card__title">Tarefas abertas</h3>
            </header>
            {openTasks.length === 0 ? (
              <div className="peg-empty" style={{ padding: 24 }}>
                <span className="peg-empty__body">Nenhuma tarefa aberta.</span>
              </div>
            ) : (
              <Stack gap={0}>
                {openTasks.map((t) => (
                  <Group key={t.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                    <Icon name="clipboardList" size={14} />
                    <span className="peg-grow peg-truncate" style={{ fontSize: 13 }}>{t.title}</span>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{formatDate(t.dueAt)}</span>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      </div>

      <CreateVisitModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        onCreated={() => {
          toast.success('Visita agendada');
          setCreateOpen(false);
          visitsQ.reload();
        }}
      />
    </div>
  );
}

function CreateVisitModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: SyntheticEvent) {
    e.preventDefault();
    if (!scheduledAt) return;
    setBusy(true);
    try {
      const body: { scheduledAt: string; note?: string } = { scheduledAt: new Date(scheduledAt).toISOString() };
      if (note.trim()) body.note = note.trim();
      await apiClient('/visits', { method: 'POST', body });
      setScheduledAt('');
      setNote('');
      onCreated();
    } catch (err) {
      toast.error('Falha ao agendar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agendar visita"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-visit-form" loading={busy}>Agendar</Button>
        </>
      }
    >
      <form id="create-visit-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Input label="Data e hora" type="datetime-local" required value={scheduledAt} onChange={(e) => { setScheduledAt(e.target.value); }} />
        <Input label="Observação" optional placeholder="Ex.: Confirmar antes com o interessado" value={note} onChange={(e) => { setNote(e.target.value); }} />
        <p className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Para vincular a um lead, imóvel ou contato, abra o Lead 360 correspondente.
        </p>
      </form>
    </Modal>
  );
}

function formatDayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00`);
  const today = new Date();
  const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (isoDay === today.toISOString().slice(0, 10)) return `Hoje · ${label}`;
  return label;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function CalendarClient() {
  return (
    <ToastProvider>
      <CalendarBody />
    </ToastProvider>
  );
}
