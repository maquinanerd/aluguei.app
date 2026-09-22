'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  Group,
  Icon,
  Input,
  Modal,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDateTime } from '@aluguei/ui';
import { ReasonModal } from '@/components/reason-modal';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { useLookup } from '@/lib/lookup';
import { canRescheduleVisit, visitActions } from '@/lib/crm-lifecycle';
import type { VisitStatus } from '@/lib/crm-lifecycle';
import { label, VISIT_STATUS_LABELS, VISIT_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Visit {
  id: string;
  leadId: string | null;
  partyId: string | null;
  propertyId: string | null;
  scheduledAt: string;
  status: string;
  note: string | null;
  cancelReason: string | null;
  statusChangedAt: string | null;
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

/** Mensagem de sucesso por transição (P2-02). */
const TRANSITION_TOASTS: Record<string, string> = {
  CONFIRMED: 'Visita confirmada',
  DONE: 'Visita realizada',
  NO_SHOW: 'Não comparecimento registrado',
  CANCELLED: 'Visita cancelada',
};

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={1}>
      <span
        className="peg-text-tertiary"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}
      >
        {title}
      </span>
      {children}
    </Stack>
  );
}

function VisitsBody() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/visits?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{
    visits: Visit[];
    total: number;
  }>(queryPath, [queryPath]);
  // Nomes só das linhas da página, por `ids` (antes limit=200 → 400 — P1-01).
  const partyMap = useLookup<Party>(
    'parties',
    (data?.visits ?? []).map((v) => v.partyId),
  ).map;
  const propertyMap = useLookup<Property>(
    'properties',
    (data?.visits ?? []).map((v) => v.propertyId),
  ).map;

  if (permissionDenied) return <PermissionDenied title="Sem acesso a visitas" />;

  const detail = detailId ? (data?.visits.find((v) => v.id === detailId) ?? null) : null;

  async function transition(visit: Visit, to: VisitStatus, reason?: string) {
    setBusy(true);
    try {
      await apiClient(`/visits/${visit.id}/status`, {
        method: 'PATCH',
        body: reason === undefined ? { status: to } : { status: to, reason },
      });
      toast.success(TRANSITION_TOASTS[to] ?? 'Visita atualizada');
      setCancelOpen(false);
      reload();
    } catch (err) {
      toast.error('Falha na visita', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Visit>[] = [
    {
      key: 'when',
      header: 'Quando',
      sortable: true,
      render: (v) => <span style={{ fontWeight: 500 }}>{formatDateTime(v.scheduledAt)}</span>,
    },
    {
      key: 'property',
      header: 'Imóvel',
      render: (v) => (
        <span className="peg-text-secondary">
          {propertyMap.get(v.propertyId ?? '')?.title ?? '—'}
        </span>
      ),
    },
    {
      key: 'party',
      header: 'Interessado',
      render: (v) => (
        <span className="peg-text-secondary">{partyMap.get(v.partyId ?? '')?.name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => (
        <Badge tone={VISIT_STATUS_TONES[v.status] ?? 'neutral'}>
          {label(VISIT_STATUS_LABELS, v.status)}
        </Badge>
      ),
    },
  ];

  const actions = detail ? visitActions(detail.status) : [];

  return (
    <div className="app-page">
      <PageToolbar
        title="Visitas"
        description="Agenda de visitas aos imóveis."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(VISIT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar visitas"
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
            Agendar visita
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.visits ?? []}
        loading={loading}
        onRowClick={(v) => {
          setDetailId(v.id);
        }}
        emptyTitle="Nenhuma visita"
        emptyBody="Agende visitas para os interessados nos imóveis."
        emptyActionLabel="Agendar visita"
        onEmptyAction={() => {
          setCreateOpen(true);
        }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <Drawer
        open={detail !== null}
        onClose={() => {
          setDetailId(null);
        }}
        title="Detalhe da visita"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setDetailId(null);
            }}
          >
            Fechar
          </Button>
        }
      >
        {detail ? (
          <Stack gap={4}>
            <Detail title="Data e hora">
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {formatDateTime(detail.scheduledAt)}
              </span>
            </Detail>
            <Detail title="Imóvel">
              <span style={{ fontSize: 14 }}>
                {propertyMap.get(detail.propertyId ?? '')?.title ?? '—'}
              </span>
            </Detail>
            <Detail title="Interessado">
              <span style={{ fontSize: 14 }}>
                {partyMap.get(detail.partyId ?? '')?.name ?? '—'}
              </span>
            </Detail>
            <Detail title="Status">
              <div>
                <Badge tone={VISIT_STATUS_TONES[detail.status] ?? 'neutral'}>
                  {label(VISIT_STATUS_LABELS, detail.status)}
                </Badge>
              </div>
            </Detail>
            {detail.cancelReason ? (
              <Detail title="Motivo do cancelamento">
                <span style={{ fontSize: 13 }}>{detail.cancelReason}</span>
              </Detail>
            ) : null}
            <Detail title="Observação">
              <span style={{ fontSize: 13 }}>{detail.note ?? '—'}</span>
            </Detail>
            {actions.length > 0 || canRescheduleVisit(detail.status) ? (
              <Detail title="Ações">
                <Group gap={2} wrap>
                  {actions.map((action) => (
                    <Button
                      key={action.to}
                      size="sm"
                      variant={
                        action.tone === 'danger'
                          ? 'danger-subtle'
                          : action.tone === 'brand'
                            ? 'brand'
                            : 'secondary'
                      }
                      loading={busy}
                      onClick={() => {
                        if (action.needsReason) {
                          setCancelOpen(true);
                          return;
                        }
                        void transition(detail, action.to);
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                  {canRescheduleVisit(detail.status) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Icon name="calendarClock" size={14} />}
                      onClick={() => {
                        setRescheduleOpen(true);
                      }}
                    >
                      Reagendar
                    </Button>
                  ) : null}
                </Group>
              </Detail>
            ) : null}
          </Stack>
        ) : null}
      </Drawer>

      {detail && cancelOpen ? (
        <ReasonModal
          title="Cancelar visita"
          confirmLabel="Cancelar visita"
          busy={busy}
          onClose={() => {
            setCancelOpen(false);
          }}
          onConfirm={(reason) => void transition(detail, 'CANCELLED', reason)}
        />
      ) : null}
      {detail && rescheduleOpen ? (
        <RescheduleModal
          visit={detail}
          onClose={() => {
            setRescheduleOpen(false);
          }}
          onDone={() => {
            toast.success('Visita reagendada');
            setRescheduleOpen(false);
            reload();
          }}
        />
      ) : null}

      <CreateVisitModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        onCreated={() => {
          toast.success('Visita agendada');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function RescheduleModal({
  visit,
  onClose,
  onDone,
}: {
  visit: Visit;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    // `datetime-local` é hora local do navegador; o instante vai em ISO para a API.
    const when = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(when.getTime())) {
      setError('Informe a nova data e hora');
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/visits/${visit.id}/reschedule`, {
        method: 'POST',
        body: { scheduledAt: when.toISOString() },
      });
      onDone();
    } catch (err) {
      toast.error('Falha ao reagendar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reagendar visita"
      size="sm"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="primary" type="submit" form="reschedule-visit-form" loading={busy}>
            Reagendar
          </Button>
        </>
      }
    >
      <form
        id="reschedule-visit-form"
        className="peg-stack"
        style={{ gap: 12 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          Data atual: {formatDateTime(visit.scheduledAt)}. A visita volta para agendada e precisa
          ser confirmada de novo.
        </span>
        <Input
          label="Nova data e hora"
          type="datetime-local"
          required
          value={scheduledAt}
          onChange={(e) => {
            setScheduledAt(e.target.value);
            setError(null);
          }}
          {...(error ? { error } : {})}
        />
      </form>
    </Modal>
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

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!scheduledAt) return;
    setBusy(true);
    try {
      const body: { scheduledAt: string; note?: string } = {
        scheduledAt: new Date(scheduledAt).toISOString(),
      };
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
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-visit-form" loading={busy}>
            Agendar
          </Button>
        </>
      }
    >
      <form
        id="create-visit-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <Input
          label="Data e hora"
          type="datetime-local"
          required
          value={scheduledAt}
          onChange={(e) => {
            setScheduledAt(e.target.value);
          }}
        />
        <Input
          label="Observação"
          optional
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          placeholder="Ex.: Confirmar com o interessado"
        />
      </form>
    </Modal>
  );
}

export function VisitsClient() {
  return (
    <ToastProvider>
      <VisitsBody />
    </ToastProvider>
  );
}
