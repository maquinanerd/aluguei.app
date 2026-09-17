'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmModal,
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
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { useLookup } from '@/lib/lookup';
import { saoPauloToday } from '@/lib/lease-rules';
import { chargeActions } from '@/lib/charge-rules';
import { label, CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES } from './finance-labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Charge {
  id: string;
  leaseId: string;
  periodStart: string;
  dueDate: string;
  status: string;
  amountCents: number;
  rentCents: number;
  condoFeeCents: number;
  lateFeeCents: number;
  interestCents: number;
  taxesCents: number;
  discountCents: number;
  paidAt: string | null;
  providerChargeId: string | null;
}

interface Lease {
  id: string;
  propertyId: string;
  status: string;
}

function ChargesBody() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Pagamento com estado próprio: usar o do detalhe abria o painel lateral por cima do diálogo.
  const [payCharge, setPayCharge] = useState<Charge | null>(null);
  const [cancelCharge, setCancelCharge] = useState<Charge | null>(null);
  const [busy, setBusy] = useState(false);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (status) params.set('status', status);
    return `/charges?${params.toString()}`;
  }, [page, status]);

  const { data, loading, error, permissionDenied, reload } = useQuery<{
    charges: Charge[];
    total: number;
  }>(queryPath, [queryPath]);
  const leasesQ = useQuery<{ leases: Lease[]; total: number }>('/leases?limit=100', []);
  const leaseProperties = useLookup<{ id: string; title: string }>(
    'properties',
    (leasesQ.data?.leases ?? []).map((lease) => lease.propertyId),
  ).map;

  if (permissionDenied) return <PermissionDenied title="Sem acesso a cobranças" />;

  const detail = detailId ? (data?.charges.find((c) => c.id === detailId) ?? null) : null;

  async function cancel() {
    if (!cancelCharge) return;
    setBusy(true);
    try {
      await apiClient(`/charges/${cancelCharge.id}/cancel`, { method: 'POST' });
      toast.success('Cobrança cancelada');
      setCancelCharge(null);
      reload();
    } catch (err) {
      toast.error('Falha ao cancelar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Charge>[] = [
    {
      key: 'period',
      header: 'Período',
      sortable: true,
      render: (c) => <span style={{ fontWeight: 500 }}>{formatDate(c.periodStart)}</span>,
    },
    {
      key: 'due',
      header: 'Vencimento',
      render: (c) => <span className="peg-text-secondary">{formatDate(c.dueDate)}</span>,
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (c) => <span style={{ fontWeight: 600 }}>{formatBRL(c.amountCents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge tone={CHARGE_STATUS_TONES[c.status] ?? 'neutral'}>
          {label(CHARGE_STATUS_LABELS, c.status)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (c) => {
        // Espelha o domínio: agendada também é cancelada; vencida não (P1-17).
        const actions = chargeActions(c.status);
        return (
          <Group gap={1}>
            {actions.receive ? (
              <Button
                size="xs"
                variant="brand"
                onClick={() => {
                  setPayCharge(c);
                }}
              >
                Receber
              </Button>
            ) : null}
            {actions.cancel ? (
              <Button
                size="xs"
                variant="tertiary"
                onClick={() => {
                  setCancelCharge(c);
                }}
              >
                Cancelar
              </Button>
            ) : null}
            {actions.refund ? (
              <Button
                size="xs"
                variant="tertiary"
                onClick={() => {
                  void refund(c.id);
                }}
              >
                Estornar
              </Button>
            ) : null}
          </Group>
        );
      },
    },
  ];

  async function refund(id: string) {
    setBusy(true);
    try {
      await apiClient(`/charges/${id}/refund`, { method: 'POST' });
      toast.success('Pagamento estornado');
      reload();
    } catch (err) {
      toast.error('Falha ao estornar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-page">
      <PageToolbar
        title="Cobranças"
        description="Cobranças de aluguel por locação."
        filters={
          <Select
            size="sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            placeholder="Todos os status"
            options={Object.entries(CHARGE_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            aria-label="Filtrar cobranças"
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
            Nova cobrança
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.charges ?? []}
        loading={loading}
        onRowClick={(c) => {
          setDetailId(c.id);
        }}
        emptyTitle="Nenhuma cobrança"
        emptyBody="Gere cobranças a partir de uma locação ativa."
        emptyActionLabel="Nova cobrança"
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
        title="Detalhe da cobrança"
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
            <Group between>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Período
              </span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {formatDate(detail.periodStart)}
              </span>
            </Group>
            <Group between>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Vencimento
              </span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(detail.dueDate)}</span>
            </Group>
            <Group between>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Status
              </span>
              <Badge tone={CHARGE_STATUS_TONES[detail.status] ?? 'neutral'}>
                {label(CHARGE_STATUS_LABELS, detail.status)}
              </Badge>
            </Group>
            <div
              style={{ borderTop: '1px solid var(--peg-border)', paddingTop: 12 }}
              className="peg-stack"
            >
              <BreakdownRow label="Aluguel" value={detail.rentCents} />
              {detail.condoFeeCents > 0 ? (
                <BreakdownRow label="Condomínio" value={detail.condoFeeCents} />
              ) : null}
              {detail.lateFeeCents > 0 ? (
                <BreakdownRow label="Multa" value={detail.lateFeeCents} />
              ) : null}
              {detail.interestCents > 0 ? (
                <BreakdownRow label="Juros" value={detail.interestCents} />
              ) : null}
              {detail.discountCents > 0 ? (
                <BreakdownRow label="Desconto" value={-detail.discountCents} />
              ) : null}
              <div
                style={{ borderTop: '1px solid var(--peg-border)', marginTop: 4, paddingTop: 8 }}
                className="peg-group between"
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>
                  {formatBRL(detail.amountCents)}
                </span>
              </div>
            </div>
          </Stack>
        ) : null}
      </Drawer>

      <CreateChargeModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        leases={leasesQ.data?.leases ?? []}
        propertyTitles={leaseProperties}
        onCreated={() => {
          toast.success('Cobrança criada');
          setCreateOpen(false);
          reload();
        }}
      />

      <PaymentModal
        open={payCharge !== null}
        onClose={() => {
          setPayCharge(null);
        }}
        charge={payCharge}
        onDone={() => {
          setPayCharge(null);
          toast.success('Pagamento iniciado', 'Acompanhe em Pagamentos.');
          reload();
        }}
      />

      <ConfirmModal
        open={cancelCharge !== null}
        onClose={() => {
          setCancelCharge(null);
        }}
        onConfirm={() => {
          void cancel();
        }}
        title="Cancelar cobrança"
        body="Cancelar esta cobrança? A ação é auditada."
        confirmLabel="Cancelar cobrança"
        danger
        loading={busy}
      />
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="peg-group between" style={{ padding: '2px 0' }}>
      <span className="peg-text-secondary" style={{ fontSize: 13 }}>
        {label}
      </span>
      <span style={{ fontSize: 13 }}>{formatBRL(value)}</span>
    </div>
  );
}

function CreateChargeModal({
  open,
  onClose,
  leases,
  propertyTitles,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  leases: Lease[];
  propertyTitles: ReadonlyMap<string, { title: string }>;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [leaseId, setLeaseId] = useState('');
  // Mês de referência no calendário de São Paulo; sem data escolhida, a API usa o dia de
  // vencimento da locação (G3, P1-07).
  const [month, setMonth] = useState(() => saoPauloToday().slice(0, 7));
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!leaseId) return;
    setBusy(true);
    try {
      const body: { leaseId: string; periodStart?: string; dueDate?: string } = { leaseId };
      if (/^\d{4}-\d{2}$/.test(month)) body.periodStart = `${month}-01`;
      if (dueDate) body.dueDate = dueDate;
      await apiClient('/charges', { method: 'POST', body });
      setLeaseId('');
      setDueDate('');
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
      title="Nova cobrança"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-charge-form" loading={busy}>
            Criar
          </Button>
        </>
      }
    >
      <form
        id="create-charge-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <Select
          label="Locação"
          required
          value={leaseId}
          onChange={(e) => {
            setLeaseId(e.target.value);
          }}
          placeholder="Selecione a locação…"
          options={leases.map((l) => ({
            value: l.id,
            label: propertyTitles.get(l.propertyId)?.title ?? `Locação ${l.id.slice(0, 8)}`,
          }))}
        />
        <div className="peg-grid cols-2">
          <Input
            label="Mês de referência"
            type="month"
            required
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
            }}
          />
          <Input
            label="Vencimento"
            optional
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
            }}
            helper="Sem data, vence no dia configurado na locação."
          />
        </div>
      </form>
    </Modal>
  );
}

function PaymentModal({
  open,
  onClose,
  charge,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  charge: Charge | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState('PIX');
  const [busy, setBusy] = useState(false);

  async function pay(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!charge) return;
    setBusy(true);
    try {
      const res = await apiClient<{ pixQrCode: string | null; boletoUrl: string | null }>(
        `/charges/${charge.id}/payment`,
        {
          method: 'POST',
          body: { method },
        },
      );
      if (res.pixQrCode) {
        toast.info('Pix gerado (sandbox)', res.pixQrCode.slice(0, 40));
      }
      if (res.boletoUrl) {
        toast.info('Boleto gerado (sandbox)', res.boletoUrl.slice(0, 60));
      }
      onDone();
    } catch (err) {
      toast.error('Falha no pagamento', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={charge ? `Receber ${formatBRL(charge.amountCents)}` : 'Receber'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="pay-form" loading={busy}>
            Iniciar pagamento
          </Button>
        </>
      }
    >
      <form
        id="pay-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void pay(e);
        }}
      >
        <Select
          label="Método"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
          }}
          options={[
            { value: 'PIX', label: 'Pix' },
            { value: 'BOLETO', label: 'Boleto' },
            { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
            { value: 'MANUAL', label: 'Manual' },
          ]}
        />
        <p className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Ambiente de desenvolvimento usa provedor fake/sandbox. Nenhum valor real é movimentado.
        </p>
      </form>
    </Modal>
  );
}

export function ChargesClient() {
  return (
    <ToastProvider>
      <ChargesBody />
    </ToastProvider>
  );
}
