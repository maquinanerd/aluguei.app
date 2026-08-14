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
  Inspector,
  InspectorRows,
  InspectorSection,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES } from '@/lib/labels';
import { PermissionDenied, EmptyState } from '@aluguei/ui';

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

interface ContractParty {
  id: string;
  partyId: string | null;
  role: string;
  signOrder: number;
  signedAt: string | null;
}

interface Envelope {
  id: string;
  provider: string;
  providerEnvelopeId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Aggregate {
  contract: Contract;
  parties: ContractParty[];
  envelope: Envelope | null;
}

interface Party {
  id: string;
  name: string;
}

const ENVELOPE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  SENT: 'Enviado',
  PARTIALLY_SIGNED: 'Parcialmente assinado',
  SIGNED: 'Assinado',
  FAILED: 'Falhou',
};

const PARTY_ROLE_LABELS: Record<string, string> = {
  LANDLORD: 'Proprietário',
  TENANT: 'Locatário',
  GUARANTOR: 'Fiador',
};

function ContractBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const aggQ = useQuery<Aggregate>(`/contracts/${id}`, [id]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', [id]);

  const contract = aggQ.data?.contract ?? null;
  const cParties = aggQ.data?.parties ?? [];
  const envelope = aggQ.data?.envelope ?? null;

  const partyMap = useMemo(() => {
    const m = new Map<string, Party>();
    for (const p of partiesQ.data?.parties ?? []) m.set(p.id, p);
    return m;
  }, [partiesQ.data]);

  if (aggQ.permissionDenied) return <PermissionDenied title="Sem acesso ao contrato" />;

  if (!contract && !aggQ.loading) {
    return (
      <EmptyState
        title="Contrato não encontrado"
        actionLabel="Voltar"
        onAction={() => { router.push('/app/contracts'); }}
      />
    );
  }
  if (!contract) return <EmptyState title="Carregando contrato…" icon="fileText" />;

  async function generate() {
    setBusy(true);
    try {
      await apiClient(`/contracts/${id}/generate`, { method: 'POST' });
      toast.success('Contrato gerado');
      aggQ.reload();
    } catch (err) {
      toast.error('Falha ao gerar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function sendForSignature() {
    setBusy(true);
    try {
      await apiClient(`/contracts/${id}/send-for-signature`, { method: 'POST' });
      toast.success('Enviado para assinatura');
      aggQ.reload();
    } catch (err) {
      toast.error('Falha ao enviar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function voidContract() {
    setBusy(true);
    try {
      await apiClient(`/contracts/${id}/status`, { method: 'PATCH', body: { status: 'VOID' } });
      toast.success('Contrato cancelado');
      setConfirmVoid(false);
      aggQ.reload();
    } catch (err) {
      toast.error('Falha ao cancelar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = contract.status === 'DRAFT';
  const canSend = contract.status === 'GENERATED';

  return (
    <Stack gap={4} style={{ width: '100%' }}>
      <Breadcrumb items={[{ label: 'Painel', href: '/app' }, { label: 'Contratos', href: '/app/contracts' }, { label: contract.id.slice(0, 8) }]} />

      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>Contrato {contract.id.slice(0, 8)}</h1>
              <Badge tone={CONTRACT_STATUS_TONES[contract.status] ?? 'neutral'}>{label(CONTRACT_STATUS_LABELS, contract.status)}</Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              {contract.contentHash ? `hash: ${contract.contentHash.slice(0, 20)}…` : 'conteúdo não gerado'}
            </span>
          </Stack>
          <Group gap={2}>
            {canGenerate ? (
              <Button size="sm" variant="brand" loading={busy} onClick={() => { void generate(); }}>
                Gerar contrato
              </Button>
            ) : null}
            {canSend ? (
              <Button size="sm" variant="brand" loading={busy} onClick={() => { void sendForSignature(); }}>
                Enviar para assinatura
              </Button>
            ) : null}
            {contract.status !== 'VOID' ? (
              <Button size="sm" variant="danger-subtle" onClick={() => { setConfirmVoid(true); }}>
                Cancelar
              </Button>
            ) : null}
          </Group>
        </Group>
      </div>

      <div className="peg-grid cols-2">
        <Card title="Partes" padless>
          <Stack gap={0}>
            {cParties.length === 0 ? (
              <div className="peg-empty" style={{ padding: 24 }}>
                <span className="peg-empty__body">Nenhuma parte vinculada.</span>
              </div>
            ) : (
              cParties.map((cp) => (
                <Group key={cp.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <span className="peg-grow" style={{ fontSize: 13, fontWeight: 500 }}>
                    {cp.partyId ? partyMap.get(cp.partyId)?.name ?? '—' : '—'}
                  </span>
                  <Badge tone="neutral">{PARTY_ROLE_LABELS[cp.role] ?? cp.role}</Badge>
                  {cp.signedAt ? <Badge tone="success">assinado</Badge> : <Badge tone="warning">ordem {String(cp.signOrder)}</Badge>}
                </Group>
              ))
            )}
          </Stack>
        </Card>

        <Card title="Assinatura" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            {envelope ? (
              <>
                <Group gap={2}>
                  <Badge tone={envelope.status === 'SIGNED' ? 'success' : envelope.status === 'FAILED' ? 'danger' : 'warning'}>
                    {ENVELOPE_STATUS_LABELS[envelope.status] ?? envelope.status}
                  </Badge>
                  <Badge tone="neutral">{envelope.provider}</Badge>
                </Group>
                <Stack gap={0}>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Envelope do provedor</span>
                  <span className="peg-text-mono" style={{ fontSize: 12 }}>{envelope.providerEnvelopeId}</span>
                </Stack>
                <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Atualizado em {formatDateTime(envelope.updatedAt)}</span>
              </>
            ) : (
              <div className="peg-empty" style={{ padding: 16 }}>
                <span className="peg-empty__body">Nenhum envelope de assinatura criado.</span>
              </div>
            )}
          </Stack>
        </Card>
      </div>

      {contract.content ? (
        <Card
          title="Conteúdo do contrato"
          actions={
            <Button size="xs" variant="tertiary" onClick={() => { setShowContent((v) => !v); }}>
              {showContent ? 'Ocultar' : 'Visualizar'}
            </Button>
          }
          padless
        >
          {showContent ? (
            <pre
              style={{
                margin: 0,
                padding: 20,
                fontSize: 13,
                lineHeight: '21px',
                fontFamily: 'var(--peg-font-mono)',
                whiteSpace: 'pre-wrap',
                color: 'var(--peg-text-primary)',
              }}
            >
              {contract.content}
            </pre>
          ) : (
            <div className="peg-empty" style={{ padding: 20 }}>
              <span className="peg-empty__body">Conteúdo disponível. Use Visualizar para conferir.</span>
            </div>
          )}
        </Card>
      ) : null}

      <Inspector style={{ width: '100%', borderLeft: 'none', borderTop: '1px solid var(--peg-border)' }}>
        <InspectorSection title="Contrato">
          <InspectorRows
            rows={[
              { label: 'Status', value: label(CONTRACT_STATUS_LABELS, contract.status) },
              { label: 'Criado em', value: formatDateTime(contract.createdAt) },
              { label: 'Assinado em', value: contract.signedAt ? formatDateTime(contract.signedAt) : '—' },
            ]}
          />
        </InspectorSection>
      </Inspector>

      <ConfirmModal
        open={confirmVoid}
        onClose={() => { setConfirmVoid(false); }}
        onConfirm={() => { void voidContract(); }}
        title="Cancelar contrato"
        body="Cancelar este contrato? A ação é irreversível e auditada."
        confirmLabel="Cancelar contrato"
        danger
        loading={busy}
      />
    </Stack>
  );
}

export function ContractDetailClient() {
  return (
    <ToastProvider>
      <ContractBody />
    </ToastProvider>
  );
}
