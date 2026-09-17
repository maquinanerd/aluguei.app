'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AsyncCombobox,
  Badge,
  Button,
  Checkbox,
  DataTable,
  Icon,
  Modal,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column, ComboboxOption } from '@aluguei/ui';
import { formatDate, formatDateTime } from '@aluguei/ui';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { searchParties, searchProperties, useLookup } from '@/lib/lookup';
import {
  activeCreditConsent,
  CREDIT_SCREENING_PURPOSE,
  planApplicationConsent,
} from '@/lib/rental-application';
import type { PartyConsent } from '@/lib/rental-application';
import { label, APPLICATION_STATUS_LABELS, APPLICATION_STATUS_TONES } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Application {
  id: string;
  leadId: string | null;
  partyId: string;
  propertyId: string;
  proposalId: string | null;
  status: string;
  decisionReason: string | null;
  submittedAt: string | null;
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

function ScreeningBody() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/rental-applications?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{
    applications: Application[];
    total: number;
  }>(queryPath, [queryPath]);
  // Nomes só das linhas da página, por `ids` (antes limit=200 → 400 — P1-01).
  const partyMap = useLookup<Party>(
    'parties',
    (data?.applications ?? []).map((a) => a.partyId),
  ).map;
  const propertyMap = useLookup<Property>(
    'properties',
    (data?.applications ?? []).map((a) => a.propertyId),
  ).map;

  if (permissionDenied) return <PermissionDenied title="Sem acesso a análises de crédito" />;

  const columns: Column<Application>[] = [
    {
      key: 'party',
      header: 'Solicitante',
      render: (a) => (
        <span style={{ fontWeight: 500 }}>{partyMap.get(a.partyId)?.name ?? '—'}</span>
      ),
    },
    {
      key: 'property',
      header: 'Imóvel',
      render: (a) => (
        <span className="peg-text-secondary">{propertyMap.get(a.propertyId)?.title ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <Badge tone={APPLICATION_STATUS_TONES[a.status] ?? 'neutral'}>
          {label(APPLICATION_STATUS_LABELS, a.status)}
        </Badge>
      ),
    },
    {
      key: 'submitted',
      header: 'Enviada em',
      render: (a) => <span className="peg-text-tertiary">{formatDate(a.submittedAt)}</span>,
    },
    {
      key: 'created',
      header: 'Criada em',
      render: (a) => <span className="peg-text-tertiary">{formatDate(a.createdAt)}</span>,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Crédito"
        description="Análises de crédito e screening de locação."
        actions={
          <Button
            size="sm"
            variant="brand"
            icon={<Icon name="plus" size={14} />}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Nova candidatura
          </Button>
        }
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(APPLICATION_STATUS_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            }))}
            aria-label="Filtrar análises"
          />
        }
      />
      <DataTable
        columns={columns}
        rows={data?.applications ?? []}
        loading={loading}
        onRowClick={(a) => {
          router.push(`/app/screening/${a.id}`);
        }}
        emptyTitle="Nenhuma análise"
        emptyBody="As análises de crédito aparecerão quando aplicações forem submetidas."
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}
      <NewApplicationModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

/**
 * Candidatura nova pela tela (auditoria 2026-09-10, P1-17): solicitante e imóvel
 * buscados no servidor, autorização LGPD da análise de crédito registrada só quando
 * a pessoa autorizou, e envio para análise. Se a candidatura for criada e o envio
 * falhar, o botão tenta de novo só o envio, sem criar outra.
 */
function NewApplicationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [party, setParty] = useState<ComboboxOption | null>(null);
  const [property, setProperty] = useState<ComboboxOption | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const consentsQ = useQuery<{ consents: PartyConsent[] }>(
    open && party ? `/parties/${party.value}/consents` : null,
    [party?.value, open],
  );
  // A resposta anterior fica em `data` até a nova chegar: só vale a da pessoa escolhida.
  const activeConsent = party
    ? activeCreditConsent((consentsQ.data?.consents ?? []).filter((c) => c.partyId === party.value))
    : null;

  function close() {
    setParty(null);
    setProperty(null);
    setAuthorized(false);
    setConsentError(null);
    setCreatedId(null);
    onClose();
  }

  async function grantConsent(partyId: string) {
    try {
      await apiClient(`/parties/${partyId}/consents`, {
        method: 'POST',
        body: { purpose: CREDIT_SCREENING_PURPOSE },
      });
    } catch (err) {
      // Registrado ao mesmo tempo por outra pessoa da equipe: o consentimento já está ativo.
      if (!(err instanceof ApiClientError && err.status === 409)) throw err;
    }
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!party || !property) return;
    setBusy(true);
    let applicationId = createdId;
    try {
      if (applicationId === null) {
        const { consents } = await apiClient<{ consents: PartyConsent[] }>(
          `/parties/${party.value}/consents`,
        );
        const plan = planApplicationConsent({
          hasActiveConsent: activeCreditConsent(consents) !== null,
          authorized,
        });
        if (!plan.ok) {
          setConsentError(plan.message);
          return;
        }
        setConsentError(null);
        if (plan.grantConsent) {
          await grantConsent(party.value);
        }
        const created = await apiClient<{ application: { id: string } }>('/rental-applications', {
          method: 'POST',
          body: { partyId: party.value, propertyId: property.value },
        });
        applicationId = created.application.id;
        setCreatedId(applicationId);
      }
      await apiClient(`/rental-applications/${applicationId}/status`, {
        method: 'PATCH',
        body: { status: 'SUBMITTED' },
      });
      router.push(`/app/screening/${applicationId}`);
    } catch (err) {
      toast.error(
        applicationId === null
          ? 'Não foi possível criar a candidatura'
          : 'Candidatura criada, mas não enviada para análise',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nova candidatura"
      footer={
        <>
          <Button variant="tertiary" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-application-form" loading={busy}>
            {createdId === null ? 'Criar e enviar para análise' : 'Enviar para análise'}
          </Button>
        </>
      }
    >
      <form
        id="create-application-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <AsyncCombobox
          label="Solicitante"
          required
          disabled={createdId !== null}
          value={party}
          onChange={(option) => {
            setParty(option);
            // A autorização é da pessoa: trocar o solicitante pede a marcação de novo.
            setAuthorized(false);
            setConsentError(null);
          }}
          loadOptions={searchParties}
          placeholder="Buscar pelo nome, CPF, CNPJ ou telefone…"
        />
        <AsyncCombobox
          label="Imóvel"
          required
          disabled={createdId !== null}
          value={property}
          onChange={setProperty}
          loadOptions={searchProperties}
          placeholder="Buscar imóvel pelo título…"
        />
        {activeConsent ? (
          <span className="peg-text-secondary" style={{ fontSize: 13 }}>
            Autorização LGPD para análise de crédito registrada em{' '}
            {formatDateTime(activeConsent.grantedAt)}.
          </span>
        ) : (
          <Stack gap={1}>
            <Checkbox
              checked={authorized}
              disabled={createdId !== null}
              onChange={() => {
                setAuthorized((v) => !v);
                setConsentError(null);
              }}
              label="A pessoa autorizou a consulta de crédito (LGPD)"
            />
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              A autorização fica registrada com data e responsável.
            </span>
          </Stack>
        )}
        {consentError ? (
          <p role="alert" style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
            {consentError}
          </p>
        ) : null}
        {createdId !== null ? (
          <p role="status" style={{ fontSize: 13 }}>
            A candidatura foi criada como rascunho e ainda não foi enviada para análise.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

export function ScreeningClient() {
  return (
    <ToastProvider>
      <ScreeningBody />
    </ToastProvider>
  );
}
