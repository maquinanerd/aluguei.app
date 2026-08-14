import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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
    // lista vazia
  }

  let statement: { totals: { billedCents: number; paidCents: number; openCents: number } } | null =
    null;
  try {
    statement = await apiFetch('/portal/tenant/statement');
  } catch {
    // extrato indisponível
  }
  const totals = statement?.totals;

  return (
    <main className="portal">
      <h1>Portal do Locatário</h1>
      <p>
        {me.partyName} — {me.orgName}
      </p>
      {totals ? (
        <section>
          <h2>Resumo</h2>
          <ul>
            <li>Total cobrado: {formatCents(totals.billedCents)}</li>
            <li>Pago: {formatCents(totals.paidCents)}</li>
            <li>Em aberto: {formatCents(totals.openCents)}</li>
          </ul>
        </section>
      ) : null}
      <section>
        <h2>Cobranças</h2>
        <ul>
          {charges.map((charge) => (
            <li key={charge.id}>
              <strong>{charge.periodStart}</strong> — {charge.status} —{' '}
              {formatCents(charge.amountCents)} (vencimento {charge.dueDate})
            </li>
          ))}
          {charges.length === 0 ? <li>Nenhuma cobrança.</li> : null}
        </ul>
      </section>
      <p>
        <Link href="/">Voltar ao início</Link>
      </p>
    </main>
  );
}
