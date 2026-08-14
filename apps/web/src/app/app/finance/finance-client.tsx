'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Group,
  Icon,
  Kpi,
  Select,
  Stack,
} from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { label, CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES, LEASE_STATUS_LABELS } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, EmptyState } from '@aluguei/ui';
import { Badge } from '@aluguei/ui';

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
  paidAt: string | null;
}

interface Payment {
  id: string;
  chargeId: string;
  amountCents: number;
  method: string;
  status: string;
  paidAt: string | null;
}

interface Payout {
  id: string;
  amountCents: number;
  status: string;
  paidAt: string | null;
}

interface Lease {
  id: string;
  propertyId: string;
  status: string;
  monthlyRentCents: number;
}

function FinanceBody() {
  const router = useRouter();
  const [range, setRange] = useState('30');

  const chargesQ = useQuery<{ charges: Charge[]; total: number }>('/charges?limit=100', []);
  const paymentsQ = useQuery<{ payments: Payment[]; total: number }>('/payments?limit=100', []);
  const payoutsQ = useQuery<{ payouts: Payout[]; total: number }>('/payouts?limit=100', []);
  const leasesQ = useQuery<{ leases: Lease[]; total: number }>('/leases?limit=100', []);

  if (chargesQ.permissionDenied) return <PermissionDenied title="Sem acesso ao financeiro" />;

  const charges = chargesQ.data?.charges ?? [];
  const payments = paymentsQ.data?.payments ?? [];
  const payouts = payoutsQ.data?.payouts ?? [];
  const leases = leasesQ.data?.leases ?? [];

  const openCharges = charges.filter((c) => c.status === 'OPEN' || c.status === 'OVERDUE');
  const openTotal = openCharges.reduce((s, c) => s + c.amountCents, 0);
  const paidTotal = charges.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amountCents, 0);
  const receivedTotal = payments.filter((p) => p.status === 'CONFIRMED').reduce((s, p) => s + p.amountCents, 0);
  const pendingPayouts = payouts.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.amountCents, 0);

  return (
    <div className="app-page">
      <PageToolbar
        title="Financeiro"
        description="Visão operacional de cobranças, recebimentos e repasses."
        filters={
          <Select
            size="sm"
            value={range}
            onChange={(e) => { setRange(e.target.value); }}
            options={[
              { value: '30', label: 'Últimos 30 dias' },
              { value: '90', label: 'Últimos 90 dias' },
              { value: 'all', label: 'Todo o período' },
            ]}
            aria-label="Período"
          />
        }
        actions={
          <Group gap={2}>
            <Button size="sm" variant="secondary" onClick={() => { router.push('/app/charges'); }}>
              Cobranças
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { router.push('/app/payments'); }}>
              Pagamentos
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { router.push('/app/ledger'); }}>
              Ledger
            </Button>
          </Group>
        }
      />

      <div className="peg-grid cols-4">
        <Kpi label="Em aberto" value={formatBRL(openTotal)} delta={`${String(openCharges.length)} cobranças`} deltaTone={openCharges.length > 0 ? 'down' : 'neutral'} icon="receipt" />
        <Kpi label="Recebido (confirmado)" value={formatBRL(receivedTotal)} delta={`${String(payments.filter((p) => p.status === 'CONFIRMED').length)} pagamentos`} deltaTone="up" icon="trendingUp" />
        <Kpi label="Cobrado no período" value={formatBRL(paidTotal)} delta={`${String(charges.filter((c) => c.status === 'PAID').length)} pagas`} deltaTone="neutral" icon="checkCircle" />
        <Kpi label="Repasses pendentes" value={formatBRL(pendingPayouts)} delta={`${String(payouts.filter((p) => p.status === 'PENDING').length)} repasses`} deltaTone="neutral" icon="trendingUp" />
      </div>

      <div className="peg-grid cols-2">
        <Card title="Cobranças em aberto" padless>
          {openCharges.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma cobrança em aberto.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {openCharges.slice(0, 6).map((c) => (
                <Group key={c.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Badge tone={CHARGE_STATUS_TONES[c.status] ?? 'neutral'}>{label(CHARGE_STATUS_LABELS, c.status)}</Badge>
                  <span className="peg-grow" style={{ fontSize: 13 }}>{formatDate(c.dueDate)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(c.amountCents)}</span>
                </Group>
              ))}
            </Stack>
          )}
        </Card>

        <Card title="Repasses pendentes" padless>
          {pendingPayouts === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhum repasse pendente.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {payouts.filter((p) => p.status === 'PENDING').slice(0, 6).map((p) => (
                <Group key={p.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Badge tone="warning">Pendente</Badge>
                  <span className="peg-grow" style={{ fontSize: 13 }}>{formatDate(p.paidAt)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(p.amountCents)}</span>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </div>

      <Card title="Locação ativa" padless>
        {leases.length === 0 ? (
          <EmptyState title="Sem locações ativas" body="As locações ativas aparecerão aqui com seus valores." icon="key" />
        ) : (
          <Stack gap={0}>
            {leases.slice(0, 8).map((l) => (
              <Group key={l.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                <Icon name="key" size={14} />
                <span className="peg-grow" style={{ fontSize: 13 }}>{l.id.slice(0, 8)}</span>
                <Badge tone={l.status === 'ACTIVE' ? 'success' : l.status === 'DELINQUENT' ? 'danger' : 'neutral'}>{label(LEASE_STATUS_LABELS, l.status)}</Badge>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(l.monthlyRentCents)}</span>
              </Group>
            ))}
          </Stack>
        )}
      </Card>
    </div>
  );
}

export function FinanceClient() {
  return <FinanceBody />;
}
