import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';
import { Badge, Card, Icon, Kpi, Stack } from '@aluguei/ui';
import type { IconName } from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { label, FUNNEL_LABELS, FUNNEL_TONES, TASK_STATUS_LABELS, VISIT_STATUS_LABELS } from '@/lib/labels';
import { hasPermission } from '@/lib/rbac';
import { activeRole } from '@/lib/session';

export const metadata: Metadata = { title: 'Visão Geral | Aluguei.app' };
export const dynamic = 'force-dynamic';

interface MeDto {
  user: { id: string; name: string; email: string };
  activeOrg: { id: string; name: string; slug: string } | null;
  memberships: Array<{ id: string; orgId: string; role: string; createdAt: string }>;
}

interface LeadDto {
  id: string;
  status: string;
  source: string | null;
  channel: string | null;
  partyId: string | null;
  ownerUserId: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  notes: string | null;
  createdAt: string;
}

interface TaskDto {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
}

interface VisitDto {
  id: string;
  scheduledAt: string;
  status: string;
  propertyId: string | null;
}

interface ChargeDto {
  id: string;
  status: string;
  amountCents: number;
  dueDate: string;
}

interface PropertyDto {
  id: string;
  title: string;
  status: string;
}

export default async function OverviewPage() {
  let me: MeDto;
  try {
    me = await apiFetch<MeDto>('/auth/me');
  } catch {
    redirect('/login');
  }
  const role = activeRole({
    user: { id: me.user.id, name: me.user.name, email: me.user.email },
    activeOrg: me.activeOrg,
    memberships: me.memberships as never,
  });

  const results = await Promise.allSettled([
    hasPermission(role, 'lead:read') ? apiFetch<{ leads: LeadDto[]; total: number }>('/leads?limit=8') : null,
    hasPermission(role, 'task:read') ? apiFetch<{ tasks: TaskDto[]; total: number }>('/tasks?limit=8') : null,
    hasPermission(role, 'visit:read') ? apiFetch<{ visits: VisitDto[]; total: number }>('/visits?limit=8') : null,
    hasPermission(role, 'finance:read') ? apiFetch<{ charges: ChargeDto[]; total: number }>('/charges?limit=8') : null,
    hasPermission(role, 'property:read') ? apiFetch<{ properties: PropertyDto[]; total: number }>('/properties?limit=8') : null,
  ]);

  const [leadsRes, tasksRes, visitsRes, chargesRes, propertiesRes] = results;
  const leads = leadsRes.status === 'fulfilled' ? leadsRes.value?.leads ?? [] : [];
  const tasks = tasksRes.status === 'fulfilled' ? tasksRes.value?.tasks ?? [] : [];
  const visits = visitsRes.status === 'fulfilled' ? visitsRes.value?.visits ?? [] : [];
  const charges = chargesRes.status === 'fulfilled' ? chargesRes.value?.charges ?? [] : [];
  const properties = propertiesRes.status === 'fulfilled' ? propertiesRes.value?.properties ?? [] : [];

  const openLeads = leads.filter((l) => l.status !== 'WON' && l.status !== 'LOST').length;
  const openCharges = charges.filter((c) => c.status === 'OPEN' || c.status === 'OVERDUE').length;
  const todayVisits = visits.filter((v) => v.status === 'SCHEDULED' || v.status === 'CONFIRMED').length;

  return (
    <div className="app-page">
      <div className="peg-group between" style={{ gap: 16 }}>
        <div>
          <h1 className="app-page__title">Visão Geral</h1>
          <p className="app-page__desc">
            Olá, {me.user.name.split(' ')[0]} — central operacional de{' '}
            <strong>{me.activeOrg?.name ?? 'sua organização'}</strong>.
          </p>
        </div>
      </div>

      <div className="peg-grid cols-4">
        <Kpi label="Leads abertos" value={String(openLeads)} delta={`${String(leads.length)} mais recentes`} deltaTone="neutral" icon="users" />
        <Kpi label="Visitas hoje" value={String(todayVisits)} delta={`${String(visits.length)} próximas`} deltaTone="neutral" icon="calendarClock" />
        <Kpi label="Imóveis ativos" value={String(properties.filter((p) => p.status === 'ACTIVE').length)} delta={`${String(properties.length)} no total`} deltaTone="neutral" icon="home" />
        <Kpi label="Cobranças em aberto" value={String(openCharges)} delta={`${String(charges.length)} recentes`} deltaTone="neutral" icon="receipt" />
      </div>

      <div className="peg-grid cols-2">
        <Card
          title="Leads recentes"
          actions={
            <Link href="/app/crm/leads" style={{ fontSize: 12 }}>
              Ver todos
            </Link>
          }
          padless
        >
          {leads.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhum lead ainda. Crie o primeiro em Leads.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/app/crm/leads/${l.id}`}
                  className="peg-group"
                  style={{ gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--peg-border)', color: 'var(--peg-text-primary)', fontSize: 13 }}
                >
                  <Badge tone={FUNNEL_TONES[l.status] ?? 'neutral'}>{label(FUNNEL_LABELS, l.status)}</Badge>
                  <span className="peg-grow peg-truncate">
                    {l.channel ?? l.source ?? 'Lead sem origem'}
                  </span>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    {l.budgetMinCents !== null ? formatBRL(l.budgetMinCents) : ''}
                  </span>
                  <Icon name="chevronRight" size={14} />
                </Link>
              ))}
            </Stack>
          )}
        </Card>

        <Card
          title="Tarefas abertas"
          actions={
            <Link href="/app/crm/tasks" style={{ fontSize: 12 }}>
              Ver todas
            </Link>
          }
          padless
        >
          {tasks.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma tarefa pendente.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {tasks.slice(0, 6).map((t) => (
                <div key={t.id} className="peg-group" style={{ gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Badge tone={t.status === 'OPEN' ? 'info' : 'neutral'}>{label(TASK_STATUS_LABELS, t.status)}</Badge>
                  <span className="peg-grow peg-truncate" style={{ fontSize: 13 }}>{t.title}</span>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{formatDate(t.dueAt)}</span>
                </div>
              ))}
            </Stack>
          )}
        </Card>
      </div>

      <div className="peg-grid cols-2">
        <Card
          title="Próximas visitas"
          actions={
            <Link href="/app/visits" style={{ fontSize: 12 }}>
              Ver todas
            </Link>
          }
          padless
        >
          {visits.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma visita agendada.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {visits.slice(0, 5).map((v) => (
                <div key={v.id} className="peg-group" style={{ gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Icon name="calendarClock" size={16} />
                  <span className="peg-grow" style={{ fontSize: 13 }}>{formatDate(v.scheduledAt)}</span>
                  <Badge tone={VISIT_STATUS_LABELS[v.status] ? 'brand' : 'neutral'}>{label(VISIT_STATUS_LABELS, v.status)}</Badge>
                </div>
              ))}
            </Stack>
          )}
        </Card>

        <Card
          title="Cobranças em aberto"
          actions={
            <Link href="/app/charges" style={{ fontSize: 12 }}>
              Ver todas
            </Link>
          }
          padless
        >
          {openCharges === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma cobrança em aberto.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {charges
                .filter((c) => c.status === 'OPEN' || c.status === 'OVERDUE')
                .slice(0, 5)
                .map((c) => (
                  <div key={c.id} className="peg-group" style={{ gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                    <Badge tone={c.status === 'OVERDUE' ? 'danger' : 'warning'}>{label({ OPEN: 'Aberta', OVERDUE: 'Vencida' }, c.status)}</Badge>
                    <span className="peg-grow" style={{ fontSize: 13 }}>{formatDate(c.dueDate)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(c.amountCents)}</span>
                  </div>
                ))}
            </Stack>
          )}
        </Card>
      </div>

      <div className="peg-grid cols-3">
        <QuickLink href="/app/crm/leads" icon="users" label="Leads" />
        <QuickLink href="/app/properties" icon="home" label="Imóveis" />
        <QuickLink href="/app/crm/contacts" icon="user" label="Contatos" />
        <QuickLink href="/app/visits" icon="calendarClock" label="Visitas" />
        <QuickLink href="/app/proposals" icon="handshake" label="Propostas" />
        <QuickLink href="/app/charges" icon="receipt" label="Cobranças" />
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label: l }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="peg-card peg-group"
      style={{ gap: 12, padding: '14px 16px', color: 'var(--peg-text-primary)', textDecoration: 'none' }}
    >
      <Icon name={icon} size={18} />
      <span style={{ fontSize: 13, fontWeight: 500 }}>{l}</span>
      <span className="peg-spacer" />
      <Icon name="chevronRight" size={14} />
    </Link>
  );
}
