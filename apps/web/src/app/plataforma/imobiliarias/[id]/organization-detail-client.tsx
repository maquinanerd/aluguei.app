'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  DataTable,
  ErrorState,
  Modal,
  Select,
  Stack,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { PageToolbar } from '@/components/page-toolbar';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, ROLE_LABELS } from '@/lib/labels';
import { formatDocument, formatPhone } from '@/lib/account-status';
import {
  PLAN_RESOURCES,
  PLAN_RESOURCE_LABELS,
  eventLabel,
  formatLimit,
  limitFor,
  usageLabel,
} from '@/lib/platform';
import type { PlatformOrganizationDetail, PlatformPlan } from '@/lib/platform';
import { OrganizationStatusBadge } from '../organizations-client';

type Dialog = 'approve' | 'reject' | 'suspend' | 'reactivate' | 'plan' | null;

type Member = PlatformOrganizationDetail['members'][number] & { id: string };

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

const memberColumns: Column<Member>[] = [
  {
    key: 'name',
    header: 'Pessoa',
    render: (m) => (
      <Stack gap={0}>
        <span style={{ fontWeight: 500 }}>{m.name}</span>
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          {m.email}
        </span>
      </Stack>
    ),
  },
  { key: 'role', header: 'Função', render: (m) => label(ROLE_LABELS, m.role) },
];

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="peg-stack" style={{ gap: 2 }}>
      <dt className="peg-text-tertiary" style={{ fontSize: 12 }}>
        {term}
      </dt>
      <dd style={{ margin: 0, fontSize: 14 }}>{children}</dd>
    </div>
  );
}

function DetailBody({ id }: { id: string }) {
  const toast = useToast();
  const detail = useQuery<PlatformOrganizationDetail>(`/platform/organizations/${id}`, [id]);
  const plans = useQuery<{ plans: PlatformPlan[] }>('/platform/plans');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [planId, setPlanId] = useState('');

  if (detail.permissionDenied) {
    return <ErrorState body="Sem acesso a esta imobiliária." />;
  }
  if (detail.error) {
    return <ErrorState body={detail.error} onRetry={detail.reload} />;
  }
  const data = detail.data;
  if (!data) {
    return (
      <div className="app-page">
        <p className="peg-text-tertiary">Carregando…</p>
      </div>
    );
  }
  const org = data.organization;
  const activePlans = (plans.data?.plans ?? []).filter((p) => p.isActive || p.id === org.plan.id);

  function open(next: Exclude<Dialog, null>) {
    setReason('');
    setPlanId(org.plan.id);
    setDialog(next);
  }

  async function run(
    path: string,
    method: 'POST' | 'PUT',
    body: Record<string, unknown> | undefined,
    success: string,
  ) {
    setBusy(true);
    try {
      await apiClient(path, { method, ...(body !== undefined ? { body } : {}) });
      toast.success(success);
      setDialog(null);
      detail.reload();
      plans.reload();
    } catch (err) {
      toast.error('Não foi possível concluir', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const base = `/platform/organizations/${org.id}`;
  const members: Member[] = data.members.map((m) => ({ ...m, id: m.userId }));
  const planOptions = activePlans.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.code})${p.isActive ? '' : ' · desativado'}`,
  }));

  return (
    <div className="app-page">
      <p style={{ fontSize: 13 }}>
        <Link href="/plataforma/imobiliarias">← Imobiliárias</Link>
      </p>
      <PageToolbar
        title={org.name}
        description={`${org.slug} · cadastro em ${formatDateTime(org.createdAt)}`}
        actions={
          <>
            {org.status === 'PENDING_APPROVAL' || org.status === 'REJECTED' ? (
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  open('approve');
                }}
              >
                Aprovar
              </Button>
            ) : null}
            {org.status === 'PENDING_APPROVAL' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  open('reject');
                }}
              >
                Recusar
              </Button>
            ) : null}
            {org.status === 'ACTIVE' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  open('suspend');
                }}
              >
                Suspender
              </Button>
            ) : null}
            {org.status === 'SUSPENDED' ? (
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  open('reactivate');
                }}
              >
                Reativar
              </Button>
            ) : null}
            {org.status !== 'PENDING_APPROVAL' ? (
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => {
                  open('plan');
                }}
              >
                Trocar plano
              </Button>
            ) : null}
          </>
        }
      />

      <Card title="Situação">
        <Stack gap={2}>
          <OrganizationStatusBadge status={org.status} />
          {org.statusReason ? (
            <span style={{ fontSize: 14 }}>
              <strong>Motivo:</strong> {org.statusReason}
            </span>
          ) : null}
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            Última mudança: {formatDateTime(org.statusChangedAt)}
          </span>
        </Stack>
      </Card>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        <Card title="Dados do cadastro">
          <dl className="peg-stack" style={{ gap: 12, margin: 0 }}>
            <Field term="Responsável">{org.owner ? org.owner.name : '—'}</Field>
            <Field term="E-mail">{org.owner ? org.owner.email : '—'}</Field>
            <Field term="Telefone">{formatPhone(org.phone)}</Field>
            <Field term="CNPJ ou CPF">{formatDocument(org.document)}</Field>
            <Field term="CRECI">{org.creci ?? '—'}</Field>
          </dl>
        </Card>
        <Card title={`Plano ${org.plan.name}`}>
          <Stack gap={3}>
            {PLAN_RESOURCES.map((resource) => {
              const limit = limitFor(org.plan, resource);
              const over = org.overLimit.includes(resource);
              return (
                <div key={resource} className="peg-group between" style={{ gap: 8 }}>
                  <span>{PLAN_RESOURCE_LABELS[resource]}</span>
                  <span className="peg-group" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>
                      {usageLabel(org.usage[resource], limit)}
                    </span>
                    {over ? <Badge tone="danger">Acima do limite</Badge> : null}
                  </span>
                </div>
              );
            })}
            {org.overLimit.length > 0 ? (
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                Nada é apagado: só novos cadastros desses itens ficam bloqueados até o uso voltar ao
                limite ou o plano mudar.
              </span>
            ) : null}
          </Stack>
        </Card>
      </div>

      <Card title="Equipe" padless>
        <DataTable columns={memberColumns} rows={members} emptyTitle="Sem membros" />
      </Card>

      <Card title="Histórico">
        {data.events.length === 0 ? (
          <span className="peg-text-tertiary">Sem eventos.</span>
        ) : (
          <ol className="peg-stack" style={{ gap: 8, margin: 0, paddingLeft: 18 }}>
            {data.events.map((event) => (
              <li key={event.id} style={{ fontSize: 14 }}>
                <strong>{eventLabel(event.action)}</strong> · {formatDateTime(event.occurredAt)}
                {event.actorEmail ? ` · ${event.actorEmail}` : ''}
                {typeof event.payload.reason === 'string' ? ` · ${event.payload.reason}` : ''}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Modal
        open={dialog === 'approve' || dialog === 'plan'}
        onClose={() => {
          setDialog(null);
        }}
        title={dialog === 'approve' ? `Aprovar ${org.name}` : 'Trocar plano'}
        footer={
          <>
            <Button
              variant="tertiary"
              onClick={() => {
                setDialog(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="plan-form" loading={busy}>
              {dialog === 'approve' ? 'Aprovar' : 'Salvar plano'}
            </Button>
          </>
        }
      >
        <form
          id="plan-form"
          className="peg-stack"
          style={{ gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog === 'approve') {
              void run(`${base}/approve`, 'POST', { planId }, 'Imobiliária aprovada');
            } else {
              void run(`${base}/plan`, 'PUT', { planId }, 'Plano alterado');
            }
          }}
        >
          <Select
            label="Plano"
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
            }}
            options={planOptions}
          />
          {(() => {
            const chosen = activePlans.find((p) => p.id === planId);
            return chosen ? (
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                Usuários: {formatLimit(chosen.maxUsers)} · Imóveis:{' '}
                {formatLimit(chosen.maxProperties)} · Anúncios publicados:{' '}
                {formatLimit(chosen.maxPublishedListings)}
              </span>
            ) : null;
          })()}
        </form>
      </Modal>

      <Modal
        open={dialog === 'reject' || dialog === 'suspend'}
        onClose={() => {
          setDialog(null);
        }}
        title={dialog === 'reject' ? `Recusar ${org.name}` : `Suspender ${org.name}`}
        footer={
          <>
            <Button
              variant="tertiary"
              onClick={() => {
                setDialog(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="reason-form"
              loading={busy}
              disabled={reason.trim() === ''}
            >
              {dialog === 'reject' ? 'Recusar' : 'Suspender'}
            </Button>
          </>
        }
      >
        <form
          id="reason-form"
          className="peg-stack"
          style={{ gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim() === '') return;
            if (dialog === 'reject') {
              void run(`${base}/reject`, 'POST', { reason: reason.trim() }, 'Cadastro recusado');
            } else {
              void run(
                `${base}/suspend`,
                'POST',
                { reason: reason.trim() },
                'Imobiliária suspensa',
              );
            }
          }}
        >
          <Textarea
            label="Motivo"
            required
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            helper="A imobiliária vê este motivo ao entrar."
          />
        </form>
      </Modal>

      <ConfirmModal
        open={dialog === 'reactivate'}
        onClose={() => {
          setDialog(null);
        }}
        onConfirm={() => {
          void run(`${base}/reactivate`, 'POST', undefined, 'Imobiliária reativada');
        }}
        title={`Reativar ${org.name}`}
        body="O painel, o portal e o site público voltam a funcionar para esta imobiliária."
        confirmLabel="Reativar"
        loading={busy}
      />
    </div>
  );
}

export function OrganizationDetailClient({ id }: { id: string }) {
  return (
    <ToastProvider>
      <DetailBody id={id} />
    </ToastProvider>
  );
}
