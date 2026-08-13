import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';
import { LeadStatusButtons } from './lead-status';

export const metadata: Metadata = { title: 'Dashboard | Aluguei.app' };
export const dynamic = 'force-dynamic';

interface LeadDto {
  id: string;
  status: string;
  source: string | null;
  channel: string | null;
  partyId: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  notes: string | null;
}

interface MeDto {
  user: { name: string; email: string };
  activeOrg: { name: string; slug: string } | null;
}

interface ChannelSummary {
  channels: Array<{
    channel: string;
    total: number;
    published: number;
    pending: number;
    failed: number;
    removed: number;
  }>;
  listings: Array<{
    listingId: string;
    title: string;
    channels: Array<{ channel: string; status: string; lastError: string | null }>;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'publicado',
  PENDING: 'pendente',
  PUBLISHING: 'publicando',
  UPDATE_PENDING: 'atualizando',
  REMOVING: 'removendo',
  REMOVED: 'removido',
  FAILED: 'falhou',
  RECONCILING: 'reconciliando',
};

export default async function DashboardPage() {
  let me: MeDto;
  try {
    me = await apiFetch<MeDto>('/auth/me');
  } catch {
    redirect('/login');
  }

  let leads: LeadDto[] = [];
  try {
    const data = await apiFetch<{ leads: LeadDto[] }>('/leads');
    leads = data.leads;
  } catch {
    // mantém lista vazia
  }

  let channels: ChannelSummary | null = null;
  try {
    channels = await apiFetch<ChannelSummary>('/channels/summary');
  } catch {
    // mantém nulo
  }

  return (
    <main className="dashboard">
      <h1>Dashboard</h1>
      <p>
        {me.user.name} · {me.activeOrg?.name ?? 'sem organização'}
      </p>
      <section>
        <h2>Leads ({leads.length})</h2>
        <ul>
          {leads.map((lead) => (
            <li key={lead.id}>
              <strong>{lead.status}</strong>
              {lead.channel ? ` · ${lead.channel}` : ''}
              {lead.source ? ` · ${lead.source}` : ''}
              {lead.budgetMinCents !== null && lead.budgetMaxCents !== null
                ? ` · R$ ${(lead.budgetMinCents / 100).toFixed(2)}–${(lead.budgetMaxCents / 100).toFixed(2)}`
                : ''}
              <LeadStatusButtons leadId={lead.id} status={lead.status} />
            </li>
          ))}
          {leads.length === 0 ? <li>Nenhum lead ainda.</li> : null}
        </ul>
      </section>
      <section>
        <h2>Canais</h2>
        {!channels || channels.listings.length === 0 ? (
          <p>Nenhuma publicação de canal ainda.</p>
        ) : (
          <table className="channels-table">
            <thead>
              <tr>
                <th>Anúncio</th>
                <th>Canal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {channels.listings.map((listing) =>
                listing.channels.map((channel) => (
                  <tr key={`${listing.listingId}-${channel.channel}`}>
                    <td>{listing.title}</td>
                    <td>{channel.channel}</td>
                    <td>
                      {STATUS_LABEL[channel.status] ?? channel.status}
                      {channel.status === 'FAILED' && channel.lastError
                        ? ` (${channel.lastError})`
                        : ''}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
