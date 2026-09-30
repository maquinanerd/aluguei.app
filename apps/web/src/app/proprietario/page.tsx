import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge, Card, Group, Stack } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiFetch } from '@/lib/api-server';
import { PortalLogoutButton } from '@/components/portal/portal-logout-button';

export const metadata: Metadata = { title: 'Portal do Proprietário' };
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
  allocations: {
    id: string;
    amountCents: number;
    chargePeriodStart: string | null;
    payoutStatus: string | null;
  }[];
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
      // Sem filtro de imóvel: a API soma todos os imóveis do proprietário. Filtrar pelo primeiro
      // mostrava metade do extrato a quem tem dois (Onda 0 da rodada de fidelidade, defeito 5).
      statement = await apiFetch<LandlordStatement>('/portal/landlord/statement');
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
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          {me.partyName}
        </span>
        <PortalLogoutButton />
      </nav>
      <main className="app-page" style={{ padding: '32px 24px', maxWidth: 900 }}>
        <div>
          <h1 className="app-page__title">Portal do Proprietário</h1>
          <p className="app-page__desc">Repasses, imóveis e demonstrativos.</p>
        </div>

        {statement ? (
          <div className="peg-grid cols-3">
            <Card title="Alocado" padless>
              <div style={{ padding: 16, fontSize: 20, fontWeight: 700 }}>
                {formatBRL(statement.totals.allocatedCents)}
              </div>
            </Card>
            <Card title="Pago" padless>
              <div
                style={{ padding: 16, fontSize: 20, fontWeight: 700, color: 'var(--peg-success)' }}
              >
                {formatBRL(statement.totals.paidOutCents)}
              </div>
            </Card>
            <Card title="Pendente" padless>
              <div
                style={{
                  padding: 16,
                  fontSize: 20,
                  fontWeight: 700,
                  color: statement.totals.pendingCents > 0 ? 'var(--peg-warning)' : 'inherit',
                }}
              >
                {formatBRL(statement.totals.pendingCents)}
              </div>
            </Card>
          </div>
        ) : null}

        {statement === null || statement.allocations.length === 0 ? null : (
          <Card title="Histórico de repasses" padless>
            <Stack gap={0}>
              {statement.allocations.map((repasse) => (
                <Group
                  key={repasse.id}
                  between
                  style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}
                >
                  <Stack gap={0}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                      {formatBRL(repasse.amountCents)}
                    </span>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                      {repasse.chargePeriodStart === null
                        ? 'Período não informado'
                        : `Competência ${formatDate(repasse.chargePeriodStart)}`}
                    </span>
                  </Stack>
                  {/* Sem status de repasse, a linha diz "previsto" em vez de
                      sugerir que o dinheiro já saiu. */}
                  <Badge tone={repasse.payoutStatus === 'PAID' ? 'success' : 'neutral'}>
                    {repasse.payoutStatus === 'PAID' ? 'repassado' : 'previsto'}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </Card>
        )}

        <Card title="Imóveis" padless>
          {properties.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhum imóvel vinculado.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {properties.map((p) => (
                <Group
                  key={p.id}
                  gap={3}
                  style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}
                >
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
