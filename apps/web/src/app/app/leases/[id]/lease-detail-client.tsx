'use client';

import { useState } from 'react';
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
import { useLookup } from '@/lib/lookup';
import {
  label,
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
  CHARGE_STATUS_LABELS,
  CHARGE_STATUS_TONES,
} from '@/lib/labels';
import { PermissionDenied, EmptyState } from '@aluguei/ui';
import { PortalAccessDialog } from '@/components/portal/portal-access-dialog';
import type { PortalKind } from '@/lib/portal-access';
import {
  describeAmendment,
  formatBps,
  leaseActions,
  rentChangesOf,
  unpaidChargesAfterEnd,
} from '@/lib/lease-rules';
import type { AmendmentLike } from '@/lib/lease-rules';
import {
  EndLeaseModal,
  LeaseTermsModal,
  ReadjustLeaseModal,
  RenewLeaseModal,
} from './lease-modals';

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
  lateFeeBps: number;
  interestMonthlyBps: number;
  dueDay: number;
  endReason: string | null;
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

interface Amendment extends AmendmentLike {
  id: string;
  createdAt: string;
}

interface LeaseAggregate {
  lease: Lease;
  charges: Charge[];
  splitRule: { agencyShareBps: number; landlordShareBps: number } | null;
  landlords: Array<{ partyId: string; shareBps: number }>;
  amendments: Amendment[];
}

interface Party {
  id: string;
  name: string;
}

interface Property {
  id: string;
  title: string;
}

type LeaseDialog = 'terms' | 'renew' | 'readjust' | 'end' | null;

function LeaseBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<LeaseDialog>(null);
  const [portalFor, setPortalFor] = useState<{
    partyId: string;
    partyName: string;
    kind: PortalKind;
  } | null>(null);

  const aggQ = useQuery<LeaseAggregate>(`/leases/${id}`, [id]);

  const agg = aggQ.data;
  const lease = agg?.lease ?? null;
  // Participações do repasse; locação sem registro (anterior à trilha C) mostra o proprietário único.
  const landlords =
    agg && agg.landlords.length > 0
      ? agg.landlords
      : lease?.landlordPartyId
        ? [{ partyId: lease.landlordPartyId, shareBps: 10_000 }]
        : [];

  // Locatário, proprietários e imóvel por `ids` (antes limit=200 → 400 — P1-01).
  const partyMap = useLookup<Party>('parties', [
    lease?.tenantPartyId,
    ...landlords.map((landlord) => landlord.partyId),
  ]).map;
  const propertyLookup = useLookup<Property>('properties', [lease?.propertyId]);
  const property = lease ? (propertyLookup.map.get(lease.propertyId) ?? null) : null;

  if (aggQ.permissionDenied) return <PermissionDenied title="Sem acesso à locação" />;

  if (!lease && !aggQ.loading) {
    return (
      <EmptyState
        title="Locação não encontrada"
        actionLabel="Voltar"
        onAction={() => {
          router.push('/app/leases');
        }}
      />
    );
  }
  if (!lease || !agg) return <EmptyState title="Carregando locação…" icon="key" />;

  const actions = leaseActions(lease.status);
  const totalOpen = agg.charges
    .filter((c) => c.status === 'OPEN' || c.status === 'OVERDUE')
    .reduce((s, c) => s + c.amountCents, 0);
  const pendingAfterEnd =
    lease.status === 'TERMINATING' || lease.status === 'ENDED'
      ? unpaidChargesAfterEnd(agg.charges, lease.endDate)
      : [];

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

  const closeDialog = () => {
    setDialog(null);
  };
  const afterSave = () => {
    setDialog(null);
    aggQ.reload();
  };
  const modalLease = {
    id: lease.id,
    status: lease.status,
    startDate: lease.startDate,
    endDate: lease.endDate,
    monthlyRentCents: lease.monthlyRentCents,
    lateFeeBps: lease.lateFeeBps,
    interestMonthlyBps: lease.interestMonthlyBps,
    dueDay: lease.dueDay,
  };

  return (
    <Stack gap={4} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { label: 'Painel', href: '/app' },
          { label: 'Locações', href: '/app/leases' },
          { label: property?.title ?? 'Locação' },
        ]}
      />

      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>{property?.title ?? 'Locação'}</h1>
              <Badge tone={LEASE_STATUS_TONES[lease.status] ?? 'neutral'}>
                {label(LEASE_STATUS_LABELS, lease.status)}
              </Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              {formatDate(lease.startDate)} →{' '}
              {lease.endDate ? formatDate(lease.endDate) : 'sem término'}
            </span>
          </Stack>
          <Group gap={2} wrap>
            <Button
              size="sm"
              variant="brand"
              loading={busy}
              onClick={() => {
                void createCharge();
              }}
            >
              Gerar cobrança
            </Button>
            {actions.readjust ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Icon name="trendingUp" size={14} />}
                onClick={() => {
                  setDialog('readjust');
                }}
              >
                Reajustar
              </Button>
            ) : null}
            {actions.renew ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Icon name="refresh" size={14} />}
                onClick={() => {
                  setDialog('renew');
                }}
              >
                Renovar
              </Button>
            ) : null}
            {actions.end ? (
              <Button
                size="sm"
                variant="danger-subtle"
                icon={<Icon name="calendarClock" size={14} />}
                onClick={() => {
                  setDialog('end');
                }}
              >
                Encerrar
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                router.push(`/app/contracts/${lease.contractId}`);
              }}
            >
              Contrato
            </Button>
          </Group>
        </Group>
      </div>

      {pendingAfterEnd.length > 0 ? (
        <div
          role="status"
          className="peg-card peg-group"
          style={{ gap: 8, padding: '12px 16px', borderColor: 'var(--peg-warning)' }}
        >
          <Icon name="alertTriangle" size={16} />
          <span className="peg-grow" style={{ fontSize: 13 }}>
            {pendingAfterEnd.length === 1
              ? '1 cobrança de mês depois do término continua devida (vencida ou com pagamento em andamento).'
              : `${String(pendingAfterEnd.length)} cobranças de meses depois do término continuam devidas (vencidas ou com pagamento em andamento).`}
          </span>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              router.push('/app/charges');
            }}
          >
            Revisar cobranças
          </Button>
        </div>
      ) : null}

      <div className="peg-grid cols-2">
        <Card title="Partes" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            <InspectorRows
              rows={[
                {
                  label: 'Locatário',
                  value: lease.tenantPartyId ? (
                    <PartyWithPortal
                      name={partyMap.get(lease.tenantPartyId)?.name ?? null}
                      onPortal={(name) => {
                        if (lease.tenantPartyId) {
                          setPortalFor({
                            partyId: lease.tenantPartyId,
                            partyName: name,
                            kind: 'TENANT',
                          });
                        }
                      }}
                    />
                  ) : (
                    '—'
                  ),
                },
                { label: 'Aluguel mensal', value: formatBRL(lease.monthlyRentCents) },
                {
                  label: 'Condomínio',
                  value: lease.condoFeeCents != null ? formatBRL(lease.condoFeeCents) : '—',
                },
              ]}
            />
          </Stack>
        </Card>

        <Card title="Proprietários" padless>
          {landlords.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Sem proprietário vinculado: sem repasse.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {landlords.map((landlord) => (
                <Group
                  key={landlord.partyId}
                  gap={3}
                  style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}
                >
                  <span className="peg-grow" style={{ fontSize: 13 }}>
                    <PartyWithPortal
                      name={partyMap.get(landlord.partyId)?.name ?? null}
                      onPortal={(name) => {
                        setPortalFor({
                          partyId: landlord.partyId,
                          partyName: name,
                          kind: 'LANDLORD',
                        });
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {formatBps(landlord.shareBps)}
                  </span>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </div>

      <div className="peg-grid cols-2">
        <Card
          title="Encargos e vencimento"
          padless
          actions={
            actions.editTerms ? (
              <Button
                size="xs"
                variant="tertiary"
                icon={<Icon name="edit" size={12} />}
                onClick={() => {
                  setDialog('terms');
                }}
              >
                Editar encargos
              </Button>
            ) : null
          }
        >
          <Stack gap={3} style={{ padding: 20 }}>
            <InspectorRows
              rows={[
                { label: 'Multa por atraso', value: formatBps(lease.lateFeeBps) },
                { label: 'Juros de mora', value: `${formatBps(lease.interestMonthlyBps)} ao mês` },
                { label: 'Vencimento', value: `Dia ${String(lease.dueDay)}` },
              ]}
            />
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              Juros pro rata die desde o vencimento. Vencimento em fim de semana ou feriado nacional
              vale até o próximo dia útil.
            </span>
          </Stack>
        </Card>

        <Card title="Split" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            {agg.splitRule ? (
              <InspectorRows
                rows={[
                  {
                    label: 'Imobiliária',
                    value: formatBps(agg.splitRule.agencyShareBps),
                  },
                  {
                    label: 'Proprietários',
                    value: formatBps(agg.splitRule.landlordShareBps),
                  },
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
            <span className="peg-empty__body">
              Nenhuma cobrança. Gere a primeira para este período.
            </span>
          </div>
        ) : (
          <Stack gap={0}>
            {agg.charges.map((c) => (
              <Group
                key={c.id}
                gap={3}
                style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(c.periodStart)}</span>
                <Badge tone={CHARGE_STATUS_TONES[c.status] ?? 'neutral'}>
                  {label(CHARGE_STATUS_LABELS, c.status)}
                </Badge>
                <span className="peg-grow" style={{ fontSize: 13 }}>
                  venc. {formatDate(c.dueDate)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(c.amountCents)}</span>
              </Group>
            ))}
          </Stack>
        )}
        {totalOpen > 0 ? (
          <div
            className="peg-group"
            style={{
              gap: 8,
              padding: '10px 16px',
              borderTop: '1px solid var(--peg-border)',
              background: 'var(--peg-surface-subtle)',
            }}
          >
            <Icon name="receipt" size={14} />
            <span style={{ fontSize: 13 }}>
              Total em aberto: <strong>{formatBRL(totalOpen)}</strong>
            </span>
          </div>
        ) : null}
      </Card>

      <Card title="Histórico da locação" padless>
        {agg.amendments.length === 0 ? (
          <div className="peg-empty" style={{ padding: 24 }}>
            <span className="peg-empty__body">Sem renovações, reajustes ou encerramento.</span>
          </div>
        ) : (
          <Stack gap={0}>
            {agg.amendments.map((amendment) => {
              const view = describeAmendment(amendment, { money: formatBRL, date: formatDate });
              return (
                <Stack
                  key={amendment.id}
                  gap={1}
                  style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}
                >
                  <Group gap={2}>
                    <strong style={{ fontSize: 13 }}>{view.title}</strong>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                      {formatDateTime(amendment.createdAt)}
                    </span>
                  </Group>
                  {view.lines.map((line) => (
                    <span key={line} className="peg-text-secondary" style={{ fontSize: 13 }}>
                      {line}
                    </span>
                  ))}
                </Stack>
              );
            })}
          </Stack>
        )}
      </Card>

      <Inspector
        style={{ width: '100%', borderLeft: 'none', borderTop: '1px solid var(--peg-border)' }}
      >
        <InspectorSection title="Locação">
          <InspectorRows
            rows={[
              { label: 'Status', value: label(LEASE_STATUS_LABELS, lease.status) },
              { label: 'Início', value: formatDate(lease.startDate) },
              { label: 'Término', value: lease.endDate ? formatDate(lease.endDate) : '—' },
              { label: 'Contrato', value: lease.contractId.slice(0, 8) },
            ]}
          />
        </InspectorSection>
      </Inspector>
      {portalFor ? (
        <PortalAccessDialog
          open
          onClose={() => {
            setPortalFor(null);
          }}
          partyId={portalFor.partyId}
          partyName={portalFor.partyName}
          kind={portalFor.kind}
        />
      ) : null}
      {/* Montados só quando abertos: cada abertura parte dos valores atuais da locação. */}
      {dialog === 'terms' ? (
        <LeaseTermsModal open onClose={closeDialog} lease={modalLease} onSaved={afterSave} />
      ) : null}
      {dialog === 'renew' ? (
        <RenewLeaseModal open onClose={closeDialog} lease={modalLease} onSaved={afterSave} />
      ) : null}
      {dialog === 'readjust' ? (
        <ReadjustLeaseModal
          open
          onClose={closeDialog}
          lease={modalLease}
          rentChanges={rentChangesOf(agg.amendments)}
          onSaved={afterSave}
        />
      ) : null}
      {dialog === 'end' ? (
        <EndLeaseModal open onClose={closeDialog} lease={modalLease} onSaved={afterSave} />
      ) : null}
    </Stack>
  );
}

/** Nome da parte com o botão de acesso ao portal (P1-16). */
function PartyWithPortal({
  name,
  onPortal,
}: {
  name: string | null;
  onPortal: (name: string) => void;
}) {
  if (!name) return <>—</>;
  return (
    <span className="peg-group" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span>{name}</span>
      <Button
        size="xs"
        variant="tertiary"
        icon={<Icon name="key" size={12} />}
        aria-label={`Acesso ao portal de ${name}`}
        onClick={() => {
          onPortal(name);
        }}
      >
        Portal
      </Button>
    </span>
  );
}

export function LeaseDetailClient() {
  return (
    <ToastProvider>
      <LeaseBody />
    </ToastProvider>
  );
}
