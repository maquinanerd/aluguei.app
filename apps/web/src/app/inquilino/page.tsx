import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge, Card, Group, Stack } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiFetch } from '@/lib/api-server';
import { PortalLogoutButton } from '@/components/portal/portal-logout-button';
import { PagarPix } from './pagar-pix';

export const metadata: Metadata = { title: 'Portal do Locatário' };
export const dynamic = 'force-dynamic';

interface PortalMe {
  partyId: string;
  partyName: string;
  kind: 'LANDLORD' | 'TENANT';
  orgId: string;
  orgName: string;
  paymentsProvider: 'FAKE' | 'ASAAS' | null;
}

interface PortalContrato {
  id: string;
  status: string;
  signedAt: string | null;
  envelopeStatus: string | null;
}

interface PortalVistoria {
  id: string;
  type: string;
  status: string;
  observations: unknown[];
  mediaCounts: { photos: number; audios: number; videos: number };
  inspectedAt: string | null;
}

interface PortalCharge {
  id: string;
  periodStart: string;
  dueDate: string;
  status: string;
  amountCents: number;
}

const CHARGE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendada',
  OPEN: 'Aberta',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Estornada',
};

export default async function InquilinoPage() {
  let me: PortalMe;
  try {
    me = await apiFetch<PortalMe>('/portal/me');
  } catch {
    redirect('/');
  }
  if (me.kind !== 'TENANT') {
    redirect('/');
  }

  let charges: PortalCharge[] = [];
  try {
    const data = await apiFetch<{ charges: PortalCharge[] }>('/portal/tenant/charges?limit=20');
    charges = data.charges;
  } catch {
    // sem cobranças
  }

  let contratos: PortalContrato[] = [];
  try {
    const data = await apiFetch<{ contracts: PortalContrato[] }>('/portal/tenant/contracts');
    contratos = data.contracts;
  } catch {
    // sem contrato
  }

  let vistorias: PortalVistoria[] = [];
  try {
    const data = await apiFetch<{ inspections: PortalVistoria[] }>('/portal/tenant/inspections');
    vistorias = data.inspections;
  } catch {
    // sem vistoria
  }

  let totals: { billedCents: number; paidCents: number; openCents: number } | null = null;
  try {
    const statement = await apiFetch<{
      totals: { billedCents: number; paidCents: number; openCents: number };
    }>('/portal/tenant/statement');
    totals = statement.totals;
  } catch {
    // sem extrato
  }

  // A cobrança que a pessoa veio ver: a mais próxima ainda não paga.
  const proxima = [...charges]
    .filter((cobranca) => cobranca.status === 'OPEN' || cobranca.status === 'OVERDUE')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <span className="peg-group" style={{ gap: 8 }}>
          <span className="app-sidebar__logo">A</span>
          <strong style={{ fontSize: 15 }}>{me.orgName}</strong>
        </span>
        <span className="peg-spacer" />
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          {me.partyName}
        </span>
        <PortalLogoutButton />
      </nav>
      <main className="app-page" style={{ padding: '32px 24px', maxWidth: 900 }}>
        <div>
          <h1 className="app-page__title">Portal do Locatário</h1>
          <p className="app-page__desc">Cobranças, pagamentos e documentos da sua locação.</p>
        </div>

        {totals ? (
          <div className="peg-grid cols-3">
            <Card title="Total cobrado" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700 }}>
                {formatBRL(totals.billedCents)}
              </div>
            </Card>
            <Card title="Pago" padless>
              <div
                style={{ padding: 16, fontSize: 20, fontWeight: 700, color: 'var(--peg-success)' }}
              >
                {formatBRL(totals.paidCents)}
              </div>
            </Card>
            <Card title="Em aberto" padless>
              <div
                style={{
                  padding: 16,
                  fontSize: 20,
                  fontWeight: 700,
                  color: totals.openCents > 0 ? 'var(--peg-danger)' : 'inherit',
                }}
              >
                {formatBRL(totals.openCents)}
              </div>
            </Card>
          </div>
        ) : null}

        {proxima === undefined ? null : (
          <Card title="Próxima cobrança" padless>
            <Stack gap={3} style={{ padding: 20 }}>
              <Group between>
                <Stack gap={0}>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>
                    {formatBRL(proxima.amountCents)}
                  </span>
                  <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                    Vence em {formatDate(proxima.dueDate)}
                  </span>
                </Stack>
                <Badge tone={proxima.status === 'OVERDUE' ? 'danger' : 'warning'}>
                  {CHARGE_STATUS_LABELS[proxima.status] ?? proxima.status}
                </Badge>
              </Group>
              <PagarPix chargeId={proxima.id} emTeste={me.paymentsProvider !== 'ASAAS'} />
            </Stack>
          </Card>
        )}

        <Card title="Documentos" padless>
          <Stack gap={0}>
            {contratos.length === 0 && vistorias.length === 0 ? (
              <div className="peg-empty" style={{ padding: 24 }}>
                <span className="peg-empty__body">Nenhum documento disponível ainda.</span>
              </div>
            ) : null}
            {contratos.map((contrato) => (
              <Group
                key={contrato.id}
                between
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}
              >
                <Stack gap={0}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Contrato de locação</span>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    {contrato.signedAt === null
                      ? 'Aguardando assinatura'
                      : `Assinado em ${formatDate(contrato.signedAt)}`}
                  </span>
                </Stack>
                <Badge tone={contrato.signedAt === null ? 'warning' : 'success'}>
                  {contrato.signedAt === null ? 'em andamento' : 'assinado'}
                </Badge>
              </Group>
            ))}
            {vistorias.map((vistoria) => (
              <Group
                key={vistoria.id}
                between
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}
              >
                <Stack gap={0}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    Vistoria {vistoria.type === 'ENTRY' ? 'de entrada' : 'de saída'}
                  </span>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    {vistoria.mediaCounts.photos} fotos · {vistoria.observations.length} observações
                    {vistoria.inspectedAt === null ? '' : ` · ${formatDate(vistoria.inspectedAt)}`}
                  </span>
                </Stack>
                <Badge tone={vistoria.status === 'COMPLETED' ? 'success' : 'neutral'}>
                  {vistoria.status === 'COMPLETED' ? 'concluída' : 'em andamento'}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Card>

        <Card title="Cobranças" padless>
          {charges.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma cobrança registrada.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {charges.map((c) => (
                <Group
                  key={c.id}
                  gap={3}
                  style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(c.periodStart)}</span>
                  <Badge
                    tone={
                      c.status === 'PAID'
                        ? 'success'
                        : c.status === 'OVERDUE'
                          ? 'danger'
                          : c.status === 'OPEN'
                            ? 'warning'
                            : 'neutral'
                    }
                  >
                    {CHARGE_STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                  <span className="peg-grow" style={{ fontSize: 13 }}>
                    venc. {formatDate(c.dueDate)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(c.amountCents)}</span>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </main>
    </div>
  );
}
