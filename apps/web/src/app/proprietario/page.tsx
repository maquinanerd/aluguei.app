import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Badge, Card, Group, Stack } from '@aluguei/ui';
import { formatBRL } from '@aluguei/ui';
import { apiFetch } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Portal do Proprietário | Aluguei.app' };
export const dynamic = 'force-dynamic';

interface PortalMe {
  partyId: string;
  partyName: string;
  kind: 'LANDLORD' | 'TENANT';
  orgId: string;
  orgName: string;
}

interface PortalProperty {
  id: string;
  title: string;
  status: string;
}

interface LandlordStatement {
  totals: { allocatedCents: number; paidOutCents: number; pendingCents: number };
}

export default async function ProprietarioPage() {
  let me: PortalMe;
  try {
    me = await apiFetch<PortalMe>('/portal/me');
  } catch {
    redirect('/');
  }
  if (me.kind !== 'LANDLORD') {
    redirect('/');
  }

  let properties: PortalProperty[] = [];
  try {
    const data = await apiFetch<{ properties: PortalProperty[] }>('/portal/landlord/properties');
    properties = data.properties;
  } catch {
    // sem imóveis
  }

  let statement: LandlordStatement | null = null;
  if (properties.length > 0) {
    try {
      statement = await apiFetch<LandlordStatement>(`/portal/landlord/statement?propertyId=${properties[0]?.id ?? ''}`);
    } catch {
      // sem extrato
    }
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
          <h1 className="app-page__title">Portal do Proprietário</h1>
          <p className="app-page__desc">Repasses, imóveis e demonstrativos.</p>
        </div>

        {statement ? (
          <div className="peg-grid cols-3">
            <Card title="Alocado" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700 }}>{formatBRL(statement.totals.allocatedCents)}</div>
            </Card>
            <Card title="Pago" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700, color: 'var(--peg-success)' }}>{formatBRL(statement.totals.paidOutCents)}</div>
            </Card>
            <Card title="Pendente" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700, color: statement.totals.pendingCents > 0 ? 'var(--peg-warning)' : 'inherit' }}>{formatBRL(statement.totals.pendingCents)}</div>
            </Card>
          </div>
        ) : null}

        <Card title="Imóveis" padless>
          {properties.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhum imóvel vinculado.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {properties.map((p) => (
                <Group key={p.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{p.title}</span>
                  <span className="peg-spacer" />
                  <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{p.status}</Badge>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </main>
    </div>
  );
}
