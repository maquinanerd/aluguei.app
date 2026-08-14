import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    // lista vazia
  }

  let statement: LandlordStatement | null = null;
  if (properties.length > 0) {
    try {
      statement = await apiFetch<LandlordStatement>(
        `/portal/landlord/statement?propertyId=${properties[0]?.id ?? ''}`,
      );
    } catch {
      statement = null;
    }
  }

  return (
    <main className="portal">
      <h1>Portal do Proprietário</h1>
      <p>
        {me.partyName} — {me.orgName}
      </p>
      {statement ? (
        <section>
          <h2>Extrato do repasse</h2>
          <ul>
            <li>Total alocado: {formatCents(statement.totals.allocatedCents)}</li>
            <li>Pago: {formatCents(statement.totals.paidOutCents)}</li>
            <li>Pendente: {formatCents(statement.totals.pendingCents)}</li>
          </ul>
        </section>
      ) : null}
      <section>
        <h2>Imóveis ({properties.length})</h2>
        <ul>
          {properties.map((property) => (
            <li key={property.id}>
              <strong>{property.title}</strong> — {property.status}
            </li>
          ))}
          {properties.length === 0 ? <li>Nenhum imóvel vinculado.</li> : null}
        </ul>
      </section>
      <p>
        <Link href="/">Voltar ao início</Link>
      </p>
    </main>
  );
}
