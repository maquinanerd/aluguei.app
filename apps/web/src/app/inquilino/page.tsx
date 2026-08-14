import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Badge, Card, Group, Stack } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiFetch } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Portal do Locatário | Aluguei.app' };
export const dynamic = 'force-dynamic';

interface PortalMe {
  partyId: string;
  partyName: string;
  kind: 'LANDLORD' | 'TENANT';
  orgId: string;
  orgName: string;
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

  let totals: { billedCents: number; paidCents: number; openCents: number } | null = null;
  try {
    const statement = await apiFetch<{ totals: { billedCents: number; paidCents: number; openCents: number } }>('/portal/tenant/statement');
    totals = statement.totals;
  } catch {
    // sem extrato
  }

  return (
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <span className="peg-group" style={{ gap: 8 }}>
          <span className="app-sidebar__logo">A</span>
          <strong style={{ fontSize: 15 }}>{me.orgName}</strong>
        </span>
        <span className="peg-spacer" />
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>{me.partyName}</span>
        <Link href="/" style={{ fontSize: 13 }}>Sair</Link>
      </nav>
      <main className="app-page" style={{ padding: '32px 24px', maxWidth: 900 }}>
        <div>
          <h1 className="app-page__title">Portal do Locatário</h1>
          <p className="app-page__desc">Cobranças, pagamentos e documentos da sua locação.</p>
        </div>

        {totals ? (
          <div className="peg-grid cols-3">
            <Card title="Total cobrado" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700 }}>{formatBRL(totals.billedCents)}</div>
            </Card>
            <Card title="Pago" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700, color: 'var(--peg-success)' }}>{formatBRL(totals.paidCents)}</div>
            </Card>
            <Card title="Em aberto" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700, color: totals.openCents > 0 ? 'var(--peg-danger)' : 'inherit' }}>{formatBRL(totals.openCents)}</div>
            </Card>
          </div>
        ) : null}

        <Card title="Cobranças" padless>
          {charges.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma cobrança registrada.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {charges.map((c) => (
                <Group key={c.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(c.periodStart)}</span>
                  <Badge tone={c.status === 'PAID' ? 'success' : c.status === 'OVERDUE' ? 'danger' : c.status === 'OPEN' ? 'warning' : 'neutral'}>
                    {CHARGE_STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                  <span className="peg-grow" style={{ fontSize: 13 }}>venc. {formatDate(c.dueDate)}</span>
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
