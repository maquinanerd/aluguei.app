'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  Group,
  Icon,
  Inspector,
  InspectorRows,
  InspectorSection,
  Modal,
  Stack,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { useLookup } from '@/lib/lookup';
import { buildDecisionPayload, creditActions, decisionSourceLabel } from '@/lib/credit-decision';
import type { CreditDecision } from '@/lib/credit-decision';
import {
  label,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  SCREENING_DECISION_LABELS,
} from '@/lib/labels';
import { PermissionDenied, EmptyState } from '@aluguei/ui';

interface Application {
  id: string;
  leadId: string | null;
  partyId: string;
  propertyId: string;
  proposalId: string | null;
  status: string;
  decisionReason: string | null;
  decisionSource: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface ScreeningResult {
  id: string;
  provider: string;
  score: number | null;
  decision: 'APPROVE' | 'REVIEW' | 'REJECT';
  createdAt: string;
}

interface Consent {
  id: string;
  purpose: string;
  grantedAt: string;
  revokedAt: string | null;
}

interface Aggregate {
  application: Application;
  latestScreeningResult: ScreeningResult | null;
  consent: Consent | null;
}

interface Party {
  id: string;
  name: string;
}

interface Property {
  id: string;
  title: string;
}

interface Proposal {
  id: string;
  monthlyRentCents: number;
  status: string;
}

function ScreeningBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Decisão manual com motivo digitado (trilha A do G2, P1-06): nunca texto fixo.
  const [decision, setDecision] = useState<CreditDecision | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const appQ = useQuery<Aggregate>(`/rental-applications/${id}`, [id]);
  const proposalsQ = useQuery<{ proposals: Proposal[] }>('/proposals?limit=100', [id]);

  const application = appQ.data?.application ?? null;
  const screening = appQ.data?.latestScreeningResult ?? null;
  const consent = appQ.data?.consent ?? null;

  // Nome do solicitante e do imóvel por `ids` (antes limit=200 → 400 — P1-01).
  const partyMap = useLookup<Party>('parties', [application?.partyId]).map;
  const propertyMap = useLookup<Property>('properties', [application?.propertyId]).map;

  const proposal = useMemo(
    () => proposalsQ.data?.proposals.find((p) => p.id === application?.proposalId) ?? null,
    [proposalsQ.data, application],
  );

  if (appQ.permissionDenied) return <PermissionDenied title="Sem acesso à análise" />;

  if (!application && !appQ.loading) {
    return (
      <EmptyState
        title="Análise não encontrada"
        body="Verifique o endereço ou volte para a lista."
        actionLabel="Voltar"
        onAction={() => {
          router.push('/app/screening');
        }}
      />
    );
  }

  if (!application) return <EmptyState title="Carregando análise…" icon="shield" />;

  // Screening só em SUBMITTED; decisão só em MANUAL_REVIEW (a API responde 409 fora disso).
  const actions = creditActions(application.status);

  function openDecision(next: CreditDecision) {
    setDecision(next);
    setReason('');
    setReasonError(null);
  }

  function closeDecision() {
    setDecision(null);
    setReasonError(null);
  }

  async function runScreening() {
    setBusy(true);
    try {
      await apiClient(`/rental-applications/${id}/screening`, { method: 'POST', body: {} });
      toast.success('Screening solicitado', 'Análise em processamento.');
      appQ.reload();
    } catch (err) {
      toast.error('Falha no screening', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (decision === null) return;
    const payload = buildDecisionPayload(decision, reason);
    if (!payload.ok) {
      setReasonError(payload.message);
      return;
    }
    setReasonError(null);
    setBusy(true);
    try {
      await apiClient(`/rental-applications/${id}/status`, {
        method: 'PATCH',
        body: payload.body,
      });
      toast.success(decision === 'APPROVED' ? 'Crédito aprovado' : 'Crédito rejeitado');
      setDecision(null);
      setReason('');
      appQ.reload();
    } catch (err) {
      toast.error('Falha ao registrar a decisão', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const decisionTone =
    screening?.decision === 'APPROVE'
      ? 'success'
      : screening?.decision === 'REJECT'
        ? 'danger'
        : 'warning';

  return (
    <Stack gap={4} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { label: 'Painel', href: '/app' },
          { label: 'Crédito', href: '/app/screening' },
          { label: partyMap.get(application.partyId)?.name ?? 'Análise' },
        ]}
      />

      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>
                {partyMap.get(application.partyId)?.name ?? 'Solicitante'}
              </h1>
              <Badge tone={APPLICATION_STATUS_TONES[application.status] ?? 'neutral'}>
                {label(APPLICATION_STATUS_LABELS, application.status)}
              </Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              {propertyMap.get(application.propertyId)?.title ?? 'Imóvel'}
              {proposal ? ` · ${formatBRL(proposal.monthlyRentCents)}/mês` : ''}
            </span>
          </Stack>
          <Group gap={2}>
            {actions.canRequestScreening ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Icon name="refresh" size={14} />}
                loading={busy}
                onClick={() => {
                  void runScreening();
                }}
              >
                Solicitar screening
              </Button>
            ) : null}
            {actions.decisions.includes('REJECTED') ? (
              <Button
                size="sm"
                variant="danger-subtle"
                onClick={() => {
                  openDecision('REJECTED');
                }}
              >
                Rejeitar
              </Button>
            ) : null}
            {actions.decisions.includes('APPROVED') ? (
              <Button
                size="sm"
                variant="brand"
                onClick={() => {
                  openDecision('APPROVED');
                }}
              >
                Aprovar
              </Button>
            ) : null}
          </Group>
        </Group>
      </div>

      <div className="peg-grid cols-2">
        <Card title="Resultado do screening" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            {screening ? (
              <>
                <Group gap={2}>
                  <Badge tone={decisionTone}>
                    {SCREENING_DECISION_LABELS[screening.decision] ?? screening.decision}
                  </Badge>
                  <Badge tone="neutral">provedor: {screening.provider}</Badge>
                </Group>
                {screening.score !== null ? (
                  <div className="peg-stack" style={{ gap: 4 }}>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                      Score
                    </span>
                    <span style={{ fontSize: 28, fontWeight: 600 }}>{String(screening.score)}</span>
                  </div>
                ) : null}
                <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                  Decisão em {formatDateTime(screening.createdAt)}
                </span>
              </>
            ) : (
              <div className="peg-empty" style={{ padding: 16 }}>
                <span className="peg-empty__body">
                  Nenhum screening executado. Solicite para iniciar a análise.
                </span>
              </div>
            )}
          </Stack>
        </Card>

        <Card title="Consentimento LGPD" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            {consent ? (
              <>
                <Group gap={2}>
                  <Badge tone="success">Consentimento ativo</Badge>
                  <Badge tone="info">{consent.purpose}</Badge>
                </Group>
                <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                  Concedido em {formatDateTime(consent.grantedAt)}
                </span>
              </>
            ) : (
              <div className="peg-empty" style={{ padding: 16 }}>
                <span className="peg-empty__body">
                  Sem consentimento registrado para análise de crédito.
                </span>
              </div>
            )}
          </Stack>
        </Card>
      </div>

      <Card title="Decisão" padless>
        <Stack gap={2} style={{ padding: 20 }}>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            Motivo
          </span>
          <span style={{ fontSize: 14 }}>{application.decisionReason ?? '—'}</span>
          <div className="peg-grid cols-2">
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                Origem
              </span>
              <span style={{ fontSize: 13 }}>
                {decisionSourceLabel(application.decisionSource)}
              </span>
            </Stack>
            <Stack gap={1}>
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                Responsável
              </span>
              <span
                className={application.decidedBy ? 'peg-text-mono' : undefined}
                style={{ fontSize: 13 }}
                title={application.decidedBy ?? undefined}
              >
                {application.decidedBy
                  ? `usuário ${application.decidedBy.slice(0, 8)}`
                  : application.decisionSource === 'AUTOMATIC'
                    ? 'regras do screening'
                    : '—'}
              </span>
            </Stack>
          </div>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            Decidida em {formatDateTime(application.decidedAt)}
          </span>
          {application.status === 'SCREENING' ? (
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              Aguardando o resultado do screening. A decisão manual só existe em revisão manual.
            </span>
          ) : null}
        </Stack>
      </Card>

      <Inspector
        style={{ width: '100%', borderLeft: 'none', borderTop: '1px solid var(--peg-border)' }}
      >
        <InspectorSection title="Aplicação">
          <InspectorRows
            rows={[
              { label: 'Solicitante', value: partyMap.get(application.partyId)?.name ?? '—' },
              { label: 'Imóvel', value: propertyMap.get(application.propertyId)?.title ?? '—' },
              { label: 'Status', value: label(APPLICATION_STATUS_LABELS, application.status) },
              { label: 'Criada em', value: formatDateTime(application.createdAt) },
            ]}
          />
        </InspectorSection>
      </Inspector>

      <Modal
        open={decision !== null}
        onClose={closeDecision}
        title={decision === 'REJECTED' ? 'Rejeitar crédito' : 'Aprovar crédito'}
        footer={
          <>
            <Button variant="tertiary" onClick={closeDecision}>
              Cancelar
            </Button>
            <Button
              variant={decision === 'REJECTED' ? 'danger-subtle' : 'brand'}
              type="submit"
              form="credit-decision-form"
              loading={busy}
            >
              {decision === 'REJECTED' ? 'Rejeitar' : 'Aprovar'}
            </Button>
          </>
        }
      >
        <form
          id="credit-decision-form"
          className="peg-stack"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void decide();
          }}
        >
          <Textarea
            label="Motivo da decisão"
            required
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            placeholder="Ex.: renda comprovada de 3x o aluguel e nenhuma restrição ativa."
          />
          {reasonError ? (
            <span className="peg-field__error" role="alert">
              {reasonError}
            </span>
          ) : null}
          <p className="peg-text-tertiary" style={{ fontSize: 12 }}>
            O motivo e o responsável ficam registrados na auditoria do crédito.
          </p>
        </form>
      </Modal>
    </Stack>
  );
}

export function ScreeningDetailClient() {
  return (
    <ToastProvider>
      <ScreeningBody />
    </ToastProvider>
  );
}
