'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  ConfirmModal,
  Group,
  Icon,
  Inspector,
  InspectorRows,
  InspectorSection,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, APPLICATION_STATUS_LABELS, APPLICATION_STATUS_TONES, SCREENING_DECISION_LABELS } from '@/lib/labels';
import { PermissionDenied, EmptyState } from '@aluguei/ui';

interface Application {
  id: string;
  leadId: string | null;
  partyId: string;
  propertyId: string;
  proposalId: string | null;
  status: string;
  decisionReason: string | null;
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
  const [confirmApprove, setConfirmApprove] = useState(false);

  const appQ = useQuery<Aggregate>(`/rental-applications/${id}`, [id]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', [id]);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', [id]);
  const proposalsQ = useQuery<{ proposals: Proposal[] }>('/proposals?limit=100', [id]);

  const application = appQ.data?.application ?? null;
  const screening = appQ.data?.latestScreeningResult ?? null;
  const consent = appQ.data?.consent ?? null;

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
        onAction={() => { router.push('/app/screening'); }}
      />
    );
  }

  if (!application) return <EmptyState title="Carregando análise…" icon="shield" />;

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

  async function approve() {
    setBusy(true);
    try {
      await apiClient(`/rental-applications/${id}/status`, {
        method: 'PATCH',
        body: { status: 'APPROVED', decisionReason: 'Aprovado pela equipe' },
      });
      toast.success('Aplicação aprovada');
      setConfirmApprove(false);
      appQ.reload();
    } catch (err) {
      toast.error('Falha ao aprovar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const decisionTone = screening?.decision === 'APPROVE' ? 'success' : screening?.decision === 'REJECT' ? 'danger' : 'warning';

  return (
    <Stack gap={4} style={{ width: '100%' }}>
      <Breadcrumb items={[{ label: 'Painel', href: '/app' }, { label: 'Crédito', href: '/app/screening' }, { label: partyMap.get(application.partyId)?.name ?? 'Análise' }]} />

      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>{partyMap.get(application.partyId)?.name ?? 'Solicitante'}</h1>
              <Badge tone={APPLICATION_STATUS_TONES[application.status] ?? 'neutral'}>{label(APPLICATION_STATUS_LABELS, application.status)}</Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              {propertyMap.get(application.propertyId)?.title ?? 'Imóvel'}
              {proposal ? ` · ${formatBRL(proposal.monthlyRentCents)}/mês` : ''}
            </span>
          </Stack>
          <Group gap={2}>
            <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} loading={busy} onClick={() => { void runScreening(); }}>
              Solicitar screening
            </Button>
            <Button size="sm" variant="brand" onClick={() => { setConfirmApprove(true); }}>
              Aprovar
            </Button>
          </Group>
        </Group>
      </div>

      <div className="peg-grid cols-2">
        <Card title="Resultado do screening" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            {screening ? (
              <>
                <Group gap={2}>
                  <Badge tone={decisionTone}>{SCREENING_DECISION_LABELS[screening.decision] ?? screening.decision}</Badge>
                  <Badge tone="neutral">provedor: {screening.provider}</Badge>
                </Group>
                {screening.score !== null ? (
                  <div className="peg-stack" style={{ gap: 4 }}>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Score</span>
                    <span style={{ fontSize: 28, fontWeight: 600 }}>{String(screening.score)}</span>
                  </div>
                ) : null}
                <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Decisão em {formatDateTime(screening.createdAt)}</span>
              </>
            ) : (
              <div className="peg-empty" style={{ padding: 16 }}>
                <span className="peg-empty__body">Nenhum screening executado. Solicite para iniciar a análise.</span>
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
                <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Concedido em {formatDateTime(consent.grantedAt)}</span>
              </>
            ) : (
              <div className="peg-empty" style={{ padding: 16 }}>
                <span className="peg-empty__body">Sem consentimento registrado para análise de crédito.</span>
              </div>
            )}
          </Stack>
        </Card>
      </div>

      <Card title="Decisão" padless>
        <Stack gap={2} style={{ padding: 20 }}>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Motivo</span>
          <span style={{ fontSize: 14 }}>{application.decisionReason ?? '—'}</span>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Decidida em {formatDateTime(application.decidedAt)}</span>
        </Stack>
      </Card>

      <Inspector style={{ width: '100%', borderLeft: 'none', borderTop: '1px solid var(--peg-border)' }}>
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

      <ConfirmModal
        open={confirmApprove}
        onClose={() => { setConfirmApprove(false); }}
        onConfirm={() => { void approve(); }}
        title="Aprovar análise de crédito"
        body="Confirmar a aprovação da aplicação? A decisão é auditada."
        confirmLabel="Aprovar"
        loading={busy}
      />
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
