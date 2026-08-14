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
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDate, formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, LEASE_STATUS_LABELS, LEASE_STATUS_TONES, CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES } from '@/lib/labels';
import { PermissionDenied, EmptyState } from '@aluguei/ui';

interface Lease {
  id: string;
  contractId: string;
  tenantPartyId: string | null;
  landlordPartyId: string | null;
  propertyId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  monthlyRentCents: number;
  condoFeeCents: number | null;
  createdAt: string;
}

interface Charge {
  id: string;
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

interface LeaseAggregate {
  lease: Lease;
  charges: Charge[];
  splitRule: { agencyShareBps: number; landlordShareBps: number } | null;
}

interface Party {
  id: string;
  name: string;
}

interface Property {
  id: string;
  title: string;
}

function LeaseBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const aggQ = useQuery<LeaseAggregate>(`/leases/${id}`, [id]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', [id]);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', [id]);

  const agg = aggQ.data;
  const lease = agg?.lease ?? null;

  const partyMap = useMemo(() => {
    const m = new Map<string, Party>();
    for (const p of partiesQ.data?.parties ?? []) m.set(p.id, p);
    return m;
  }, [partiesQ.data]);

  const property = useMemo(
    () => propsQ.data?.properties.find((p) => p.id === lease?.propertyId) ?? null,
    [propsQ.data, lease],
  );

  if (aggQ.permissionDenied) return <PermissionDenied title="Sem acesso à locação" />;

  if (!lease && !aggQ.loading) {
    return (
      <EmptyState
        title="Locação não encontrada"
        actionLabel="Voltar"
        onAction={() => { router.push('/app/leases'); }}
      />
    );
  }
  if (!lease || !agg) return <EmptyState title="Carregando locação…" icon="key" />;

  const totalOpen = agg.charges.filter((c) => c.status === 'OPEN' || c.status === 'OVERDUE').reduce((s, c) => s + c.amountCents, 0);

  async function createCharge() {
    setBusy(true);
    try {
      await apiClient('/charges', { method: 'POST', body: { leaseId: id } });
      toast.success('Cobrança criada');
      aggQ.reload();
    } catch (err) {
      toast.error('Falha ao criar cobrança', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4} style={{ maxWidth: 1400, width: '100%', margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Painel', href: '/app' }, { label: 'Locações', href: '/app/leases' }, { label: property?.title ?? 'Locação' }]} />

      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>{property?.title ?? 'Locação'}</h1>
              <Badge tone={LEASE_STATUS_TONES[lease.status] ?? 'neutral'}>{label(LEASE_STATUS_LABELS, lease.status)}</Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              {formatDate(lease.startDate)} → {formatDate(lease.endDate)}
            </span>
          </Stack>
          <Group gap={2}>
            <Button size="sm" variant="brand" loading={busy} onClick={() => { void createCharge(); }}>
              Gerar cobrança
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { router.push(`/app/contracts/${lease.contractId}`); }}>
              Contrato
            </Button>
          </Group>
        </Group>
      </div>

      <div className="peg-grid cols-2">
        <Card title="Partes" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            <InspectorRows
              rows={[
                { label: 'Locatário', value: lease.tenantPartyId ? partyMap.get(lease.tenantPartyId)?.name ?? '—' : '—' },
                { label: 'Proprietário', value: lease.landlordPartyId ? partyMap.get(lease.landlordPartyId)?.name ?? '—' : '—' },
                { label: 'Aluguel mensal', value: formatBRL(lease.monthlyRentCents) },
                { label: 'Condomínio', value: lease.condoFeeCents != null ? formatBRL(lease.condoFeeCents) : '—' },
              ]}
            />
          </Stack>
        </Card>

        <Card title="Split" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            {agg.splitRule ? (
              <InspectorRows
                rows={[
                  { label: 'Imobiliária', value: `${(agg.splitRule.agencyShareBps / 100).toFixed(1)}%` },
                  { label: 'Proprietário', value: `${(agg.splitRule.landlordShareBps / 100).toFixed(1)}%` },
                ]}
              />
            ) : (
              <div className="peg-empty" style={{ padding: 12 }}>
                <span className="peg-empty__body">Nenhuma regra de split definida.</span>
              </div>
            )}
          </Stack>
        </Card>
      </div>

      <Card title="Cobranças" padless>
        {agg.charges.length === 0 ? (
          <div className="peg-empty" style={{ padding: 24 }}>
            <span className="peg-empty__body">Nenhuma cobrança. Gere a primeira para este período.</span>
          </div>
        ) : (
          <Stack gap={0}>
            {agg.charges.map((c) => (
              <Group key={c.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(c.periodStart)}</span>
                <Badge tone={CHARGE_STATUS_TONES[c.status] ?? 'neutral'}>{label(CHARGE_STATUS_LABELS, c.status)}</Badge>
                <span className="peg-grow" style={{ fontSize: 13 }}>venc. {formatDate(c.dueDate)}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(c.amountCents)}</span>
              </Group>
            ))}
          </Stack>
        )}
        {totalOpen > 0 ? (
          <div className="peg-group" style={{ gap: 8, padding: '10px 16px', borderTop: '1px solid var(--peg-border)', background: 'var(--peg-surface-subtle)' }}>
            <Icon name="receipt" size={14} />
            <span style={{ fontSize: 13 }}>Total em aberto: <strong>{formatBRL(totalOpen)}</strong></span>
          </div>
        ) : null}
      </Card>

      <Inspector style={{ width: '100%', borderLeft: 'none', borderTop: '1px solid var(--peg-border)' }}>
        <InspectorSection title="Locação">
          <InspectorRows
            rows={[
              { label: 'Status', value: label(LEASE_STATUS_LABELS, lease.status) },
              { label: 'Início', value: formatDateTime(lease.startDate) },
              { label: 'Término', value: lease.endDate ? formatDateTime(lease.endDate) : '—' },
              { label: 'Contrato', value: lease.contractId.slice(0, 8) },
            ]}
          />
        </InspectorSection>
      </Inspector>
    </Stack>
  );
}

export function LeaseDetailClient() {
  return (
    <ToastProvider>
      <LeaseBody />
    </ToastProvider>
  );
}
