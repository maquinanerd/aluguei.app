'use client';

import { useMemo, useState } from 'react';
import {
  AsyncCombobox,
  Badge,
  Button,
  ConfirmModal,
  DataTable,
  Drawer,
  Group,
  Icon,
  Input,
  Modal,
  MoneyInput,
  Select,
  Stack,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column, ComboboxOption } from '@aluguei/ui';
import { formatBRL, formatDateTime } from '@aluguei/ui';
import { ReasonModal } from '@/components/reason-modal';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { searchProperties, useLookup } from '@/lib/lookup';
import {
  civilDateFromInput,
  proposalActions,
  proposalEditable,
  proposalValidityError,
  proposalValidityLabel,
} from '@/lib/crm-lifecycle';
import type { ProposalStatus } from '@/lib/crm-lifecycle';
import { saoPauloToday } from '@/lib/lease-rules';
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
  /** Data civil do último dia de validade. */
  validUntil: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
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

const TRANSITION_TOASTS: Record<string, string> = {
  SENT: 'Proposta enviada',
  ACCEPTED: 'Proposta aceita',
  REJECTED: 'Proposta recusada',
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

function Validity({ proposal }: { proposal: Proposal }) {
  const validity = proposalValidityLabel(proposal.status, proposal.validUntil, saoPauloToday());
  return (
    <span className="peg-text-tertiary">
      {validity.text}
      {validity.expired ? ' · vencida' : ''}
    </span>
  );
}

function ProposalsBody() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/proposals?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{
    proposals: Proposal[];
    total: number;
  }>(queryPath, [queryPath]);
  // Nomes só das linhas da página, por `ids` (antes limit=200 → 400 — P1-01).
  const partyMap = useLookup<Party>(
    'parties',
    (data?.proposals ?? []).map((p) => p.partyId),
  ).map;
  const propertyMap = useLookup<Property>(
    'properties',
    (data?.proposals ?? []).map((p) => p.propertyId),
  ).map;

  if (permissionDenied) return <PermissionDenied title="Sem acesso a propostas" />;

  const detail = detailId ? (data?.proposals.find((p) => p.id === detailId) ?? null) : null;

  async function transition(
    proposal: Proposal,
    to: ProposalStatus,
    extra: { reason?: string; validUntil?: string } = {},
  ): Promise<boolean> {
    setBusy(true);
    try {
      await apiClient(`/proposals/${proposal.id}/status`, {
        method: 'PATCH',
        body: { status: to, ...extra },
      });
      toast.success(TRANSITION_TOASTS[to] ?? 'Proposta atualizada');
      setAcceptOpen(false);
      setRejectOpen(false);
      reload();
      return true;
    } catch (err) {
      toast.error('Falha na proposta', err instanceof Error ? err.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Proposal>[] = [
    {
      key: 'party',
      header: 'Interessado',
      render: (p) => (
        <span style={{ fontWeight: 500 }}>{partyMap.get(p.partyId ?? '')?.name ?? '—'}</span>
      ),
    },
    {
      key: 'property',
      header: 'Imóvel',
      render: (p) => (
        <span className="peg-text-secondary">
          {propertyMap.get(p.propertyId ?? '')?.title ?? '—'}
        </span>
      ),
    },
    {
      key: 'rent',
      header: 'Aluguel proposto',
      render: (p) => <span style={{ fontWeight: 600 }}>{formatBRL(p.monthlyRentCents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={PROPOSAL_STATUS_TONES[p.status] ?? 'neutral'}>
          {label(PROPOSAL_STATUS_LABELS, p.status)}
        </Badge>
      ),
    },
    {
      key: 'valid',
      header: 'Válida até',
      render: (p) => <Validity proposal={p} />,
    },
  ];

  const actions = detail ? proposalActions(detail.status) : [];

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
            options={Object.entries(PROPOSAL_STATUS_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            }))}
            aria-label="Filtrar propostas"
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
            Nova proposta
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.proposals ?? []}
        loading={loading}
        onRowClick={(p) => {
          setDetailId(p.id);
        }}
        emptyTitle="Nenhuma proposta"
        emptyBody="Crie propostas para os leads qualificados."
        emptyActionLabel="Nova proposta"
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
        title="Detalhe da proposta"
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
            <Detail title="Interessado">
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {partyMap.get(detail.partyId ?? '')?.name ?? '—'}
              </span>
            </Detail>
            <Detail title="Imóvel">
              <span style={{ fontSize: 14 }}>
                {propertyMap.get(detail.propertyId ?? '')?.title ?? '—'}
              </span>
            </Detail>
            <Detail title="Aluguel proposto">
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                {formatBRL(detail.monthlyRentCents)}/mês
              </span>
            </Detail>
            <Detail title="Status">
              <div>
                <Badge tone={PROPOSAL_STATUS_TONES[detail.status] ?? 'neutral'}>
                  {label(PROPOSAL_STATUS_LABELS, detail.status)}
                </Badge>
              </div>
            </Detail>
            <Detail title="Condições">
              <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{detail.terms ?? '—'}</span>
            </Detail>
            <Detail title="Válida até">
              <span style={{ fontSize: 13 }}>
                <Validity proposal={detail} />
              </span>
            </Detail>
            {detail.sentAt ? (
              <Detail title="Enviada em">
                <span style={{ fontSize: 13 }}>{formatDateTime(detail.sentAt)}</span>
              </Detail>
            ) : null}
            {detail.decidedAt ? (
              <Detail title="Decidida em">
                <span style={{ fontSize: 13 }}>{formatDateTime(detail.decidedAt)}</span>
              </Detail>
            ) : null}
            {detail.decisionReason ? (
              <Detail title="Motivo da recusa">
                <span style={{ fontSize: 13 }}>{detail.decisionReason}</span>
              </Detail>
            ) : null}
            {actions.length > 0 || proposalEditable(detail.status) ? (
              <Detail title="Ações">
                <Group gap={2} wrap>
                  {proposalEditable(detail.status) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Icon name="edit" size={14} />}
                      onClick={() => {
                        setEditOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                  ) : null}
                  {actions.map((action) => (
                    <Button
                      key={action.to}
                      size="sm"
                      variant={action.tone === 'danger' ? 'danger-subtle' : 'brand'}
                      loading={busy}
                      onClick={() => {
                        if (action.needsValidity) setSendOpen(true);
                        else if (action.needsReason) setRejectOpen(true);
                        else setAcceptOpen(true);
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </Group>
              </Detail>
            ) : null}
          </Stack>
        ) : null}
      </Drawer>

      {detail && editOpen ? (
        <EditProposalModal
          proposal={detail}
          onClose={() => {
            setEditOpen(false);
          }}
          onSaved={() => {
            toast.success('Proposta atualizada');
            setEditOpen(false);
            reload();
          }}
        />
      ) : null}
      {detail && sendOpen ? (
        <SendProposalModal
          proposal={detail}
          busy={busy}
          onClose={() => {
            setSendOpen(false);
          }}
          onSend={(validUntil) => {
            void transition(detail, 'SENT', { validUntil }).then((ok) => {
              if (ok) setSendOpen(false);
            });
          }}
        />
      ) : null}
      {detail && rejectOpen ? (
        <ReasonModal
          title="Recusar proposta"
          confirmLabel="Recusar proposta"
          busy={busy}
          onClose={() => {
            setRejectOpen(false);
          }}
          onConfirm={(reason) => void transition(detail, 'REJECTED', { reason })}
        />
      ) : null}
      <ConfirmModal
        open={detail !== null && acceptOpen}
        onClose={() => {
          setAcceptOpen(false);
        }}
        onConfirm={() => {
          if (detail) void transition(detail, 'ACCEPTED');
        }}
        title="Aceitar proposta?"
        body="A proposta fica aceita e não volta a rascunho. A candidatura e o contrato continuam nos passos seguintes."
        confirmLabel="Aceitar"
        loading={busy}
      />

      <CreateProposalModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        onCreated={() => {
          toast.success('Proposta criada');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function SendProposalModal({
  proposal,
  busy,
  onClose,
  onSend,
}: {
  proposal: Proposal;
  busy: boolean;
  onClose: () => void;
  onSend: (validUntil: string) => void;
}) {
  const [validUntil, setValidUntil] = useState(proposal.validUntil ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title="Enviar proposta"
      size="sm"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="primary" type="submit" form="send-proposal-form" loading={busy}>
            Enviar proposta
          </Button>
        </>
      }
    >
      <form
        id="send-proposal-form"
        className="peg-stack"
        style={{ gap: 12 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const problem = proposalValidityError(validUntil, saoPauloToday());
          setError(problem);
          if (problem === null) {
            onSend(validUntil.trim());
          }
        }}
      >
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          Depois de enviada, a proposta não muda de valor. Ela vale até o fim do dia da validade e
          expira sozinha no dia seguinte.
        </span>
        <Input
          label="Validade"
          type="date"
          required
          value={validUntil}
          onChange={(e) => {
            setValidUntil(e.target.value);
            setError(null);
          }}
          {...(error ? { error } : {})}
        />
      </form>
    </Modal>
  );
}

function EditProposalModal({
  proposal,
  onClose,
  onSaved,
}: {
  proposal: Proposal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rentCents, setRentCents] = useState<number | null>(proposal.monthlyRentCents);
  const [terms, setTerms] = useState(proposal.terms ?? '');
  const [validUntil, setValidUntil] = useState(proposal.validUntil ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    if (rentCents === null || rentCents <= 0) {
      setError('Informe um aluguel válido');
      return;
    }
    // Só o que mudou: a auditoria guarda o diff campo a campo.
    const body: { monthlyRentCents?: number; terms?: string; validUntil?: string } = {};
    if (rentCents !== proposal.monthlyRentCents) body.monthlyRentCents = rentCents;
    if (terms.trim() !== (proposal.terms ?? '')) body.terms = terms.trim();
    const date = civilDateFromInput(validUntil);
    if (date !== null && date !== proposal.validUntil) body.validUntil = date;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/proposals/${proposal.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar proposta"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="edit-proposal-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="edit-proposal-form"
        className="peg-stack"
        style={{ gap: 16 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {error ? (
          <span className="peg-field__error" role="alert">
            {error}
          </span>
        ) : null}
        <MoneyInput
          label="Aluguel mensal (R$)"
          required
          valueCents={rentCents}
          onValueChange={setRentCents}
        />
        <Textarea
          label="Condições"
          optional
          rows={3}
          value={terms}
          onChange={(e) => {
            setTerms(e.target.value);
          }}
        />
        <Input
          label="Válida até"
          type="date"
          optional
          value={validUntil}
          onChange={(e) => {
            setValidUntil(e.target.value);
          }}
        />
      </form>
    </Modal>
  );
}

function CreateProposalModal({
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
  // Centavos inteiros do MoneyInput (auditoria 2026-09-10, P0-07).
  const [rentCents, setRentCents] = useState<number | null>(null);
  const [terms, setTerms] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!property || rentCents === null || rentCents <= 0) {
      toast.error('Informe o imóvel e um aluguel válido');
      return;
    }
    setBusy(true);
    try {
      const body: {
        propertyId: string;
        monthlyRentCents: number;
        terms?: string;
        validUntil?: string;
      } = {
        propertyId: property.value,
        monthlyRentCents: rentCents,
      };
      if (terms.trim()) body.terms = terms.trim();
      // Data civil do campo, sem `new Date(...).toISOString()`: o instante UTC da meia-noite
      // voltava um dia em São Paulo (G3, trilha D, P2-02).
      const date = civilDateFromInput(validUntil);
      if (date !== null) body.validUntil = date;
      await apiClient('/proposals', { method: 'POST', body });
      setProperty(null);
      setRentCents(null);
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
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-proposal-form" loading={busy}>
            Criar
          </Button>
        </>
      }
    >
      <form
        id="create-proposal-form"
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
        <MoneyInput
          label="Aluguel mensal (R$)"
          required
          valueCents={rentCents}
          onValueChange={setRentCents}
          placeholder="3.500,00"
        />
        <Textarea
          label="Condições"
          optional
          rows={3}
          value={terms}
          onChange={(e) => {
            setTerms(e.target.value);
          }}
          placeholder="Ex.: caução de 1 mês, contrato 12 meses…"
        />
        <Input
          label="Válida até"
          type="date"
          optional
          value={validUntil}
          onChange={(e) => {
            setValidUntil(e.target.value);
          }}
        />
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
