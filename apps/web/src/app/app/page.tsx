import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';
import { Icon } from '@aluguei/ui';
import type { IconName } from '@aluguei/ui';
import { formatBRLShort, formatDate } from '@aluguei/ui';
import { label, CHANNEL_TYPE_LABELS, CHARGE_STATUS_LABELS, VISIT_STATUS_LABELS, VISIT_STATUS_TONES } from '@/lib/labels';
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
  ownerUserId: string | null;
  createdAt: string;
  channel: string | null;
  source: string | null;
  budgetMinCents: number | null;
}
interface TaskDto {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  relatedEntityType: string | null;
}
interface VisitDto {
  id: string;
  scheduledAt: string;
  status: string;
  propertyId: string | null;
}
interface ProposalDto {
  id: string;
  status: string;
  monthlyRentCents: number;
  createdAt: string;
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
interface ConversationDto {
  id: string;
  status: string;
  createdAt: string;
}
interface ChannelSummaryDto {
  channels: Array<{ channel: string; total: number; published: number; pending: number; failed: number; removed: number }>;
}
interface ApplicationDto { id: string; status: string; }
interface ContractDto { id: string; status: string; }
interface InspectionDto { id: string; status: string; scheduledAt: string; }
interface LeaseDto { id: string; status: string; }
interface PayoutDto { id: string; status: string; amountCents: number; }

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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const now = new Date();
  const isToday = (iso: string | null | undefined) => !!iso && new Date(iso) >= todayStart && new Date(iso) <= now;

  const results = await Promise.allSettled([
    hasPermission(role, 'lead:read') ? apiFetch<{ leads: LeadDto[] }>('/leads?limit=200') : null,
    hasPermission(role, 'task:read') ? apiFetch<{ tasks: TaskDto[] }>('/tasks?limit=200') : null,
    hasPermission(role, 'visit:read') ? apiFetch<{ visits: VisitDto[] }>('/visits?limit=200') : null,
    hasPermission(role, 'proposal:read') ? apiFetch<{ proposals: ProposalDto[] }>('/proposals?limit=200') : null,
    hasPermission(role, 'finance:read') ? apiFetch<{ charges: ChargeDto[] }>('/charges?limit=200') : null,
    hasPermission(role, 'finance:read') ? apiFetch<{ leases: LeaseDto[] }>('/leases?limit=200') : null,
    hasPermission(role, 'finance:read') ? apiFetch<{ payouts: PayoutDto[] }>('/payouts?limit=200') : null,
    hasPermission(role, 'property:read') ? apiFetch<{ properties: PropertyDto[] }>('/properties?limit=200') : null,
    hasPermission(role, 'listing:read') ? apiFetch<ChannelSummaryDto>('/channels/summary') : null,
    hasPermission(role, 'conversation:read') ? apiFetch<{ conversations: ConversationDto[] }>('/conversations?limit=200') : null,
    hasPermission(role, 'screening:read') ? apiFetch<{ applications: ApplicationDto[] }>('/rental-applications?limit=200') : null,
    hasPermission(role, 'contract:read') ? apiFetch<{ contracts: ContractDto[] }>('/contracts?limit=200') : null,
    hasPermission(role, 'inspection:read') ? apiFetch<{ inspections: InspectionDto[] }>('/inspections?limit=200') : null,
  ]);

  const [leadsR, tasksR, visitsR, proposalsR, chargesR, leasesR, payoutsR, propsR, channelsR, convsR, appsR, contractsR, inspectionsR] = results;
  const leads = leadsR.status === 'fulfilled' ? leadsR.value?.leads ?? [] : [];
  const tasks = tasksR.status === 'fulfilled' ? tasksR.value?.tasks ?? [] : [];
  const visits = visitsR.status === 'fulfilled' ? visitsR.value?.visits ?? [] : [];
  const proposals = proposalsR.status === 'fulfilled' ? proposalsR.value?.proposals ?? [] : [];
  const charges = chargesR.status === 'fulfilled' ? chargesR.value?.charges ?? [] : [];
  const leases = leasesR.status === 'fulfilled' ? leasesR.value?.leases ?? [] : [];
  const payouts = payoutsR.status === 'fulfilled' ? payoutsR.value?.payouts ?? [] : [];
  const properties = propsR.status === 'fulfilled' ? propsR.value?.properties ?? [] : [];
  const channelSummary = channelsR.status === 'fulfilled' ? channelsR.value?.channels ?? [] : [];
  const conversations = convsR.status === 'fulfilled' ? convsR.value?.conversations ?? [] : [];
  const applications = appsR.status === 'fulfilled' ? appsR.value?.applications ?? [] : [];
  const contracts = contractsR.status === 'fulfilled' ? contractsR.value?.contracts ?? [] : [];
  const inspections = inspectionsR.status === 'fulfilled' ? inspectionsR.value?.inspections ?? [] : [];

  // ---- CRM ----
  const openLeads = leads.filter((l) => l.status !== 'WON' && l.status !== 'LOST');
  const newLeadsToday = leads.filter((l) => isToday(l.createdAt)).length;
  const leadsWithoutOwner = openLeads.filter((l) => !l.ownerUserId).length;
  const awaitingResponse = openLeads.filter((l) => l.status === 'NEW' || l.status === 'QUALIFYING').length;
  const qualified = openLeads.filter((l) => l.status === 'QUALIFIED').length;

  // ---- Tarefas ----
  const overdueTasks = tasks.filter((t) => t.status === 'OPEN' && t.dueAt && new Date(t.dueAt) < now);
  const todayTasks = tasks.filter((t) => t.status === 'OPEN' && t.dueAt && new Date(t.dueAt) >= todayStart && new Date(t.dueAt) <= now);
  const actionCount = overdueTasks.length + todayTasks.length + leadsWithoutOwner + overdueCharges(charges).length + pendingSignatureCount(contracts) + failedChannelCount(channelSummary);

  // ---- Imóveis ----
  const available = properties.filter((p) => p.status === 'ACTIVE').length;
  const archived = properties.filter((p) => p.status === 'ARCHIVED').length;
  const publishedListings = channelSummary.reduce((acc, c) => acc + c.published, 0);

  // ---- Operação ----
  const screeningPending = applications.filter((a) => ['SUBMITTED', 'SCREENING', 'MANUAL_REVIEW'].includes(a.status)).length;
  const contractPending = contracts.filter((c) => ['DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED'].includes(c.status)).length;
  const inspectionsOpen = inspections.filter((i) => ['DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW'].includes(i.status)).length;
  const activeLeases = leases.filter((l) => l.status === 'ACTIVE' || l.status === 'DELINQUENT').length;

  // ---- Financeiro ----
  const overdue = overdueCharges(charges);
  const openCharges = charges.filter((c) => c.status === 'OPEN');
  const scheduledCharges = charges.filter((c) => c.status === 'SCHEDULED');
  const payoutsPending = payouts.filter((p) => p.status === 'PENDING');

  // ---- Atendimento ----
  const convOpen = conversations.filter((c) => c.status === 'OPEN' || c.status === 'ACTIVE' || c.status === 'NEEDS_HUMAN');
  const convNeedsHuman = conversations.filter((c) => c.status === 'NEEDS_HUMAN').length;

  // ---- Ciclo de locação (dados reais) ----
  const cycle = [
    { key: 'Leads', value: openLeads.length, href: '/app/crm/leads' },
    { key: 'Qualif.', value: qualified, href: '/app/crm/pipeline' },
    { key: 'Visitas', value: visits.filter((v) => v.status !== 'CANCELLED' && v.status !== 'NO_SHOW').length, href: '/app/visits' },
    { key: 'Propostas', value: proposals.filter((p) => p.status !== 'DRAFT').length, href: '/app/proposals' },
    { key: 'Crédito', value: applications.length, href: '/app/screening' },
    { key: 'Contrato', value: contracts.filter((c) => c.status !== 'VOID').length, href: '/app/contracts' },
    { key: 'Locação', value: leases.filter((l) => l.status !== 'ENDED').length, href: '/app/leases' },
  ];
  const cycleMax = Math.max(1, ...cycle.map((c) => c.value));

  // ---- Alertas reais ----
  const alerts: Array<{ tone: 'warning' | 'danger'; icon: IconName; title: string; body: string; href: string; action: string }> = [];
  const failedChannels = channelSummary.filter((c) => c.failed > 0);
  if (failedChannels.length > 0) {
    const names = failedChannels.map((c) => label(CHANNEL_TYPE_LABELS, c.channel)).join(', ');
    alerts.push({
      tone: 'danger',
      icon: 'alertTriangle',
      title: `Falha de sincronização: ${names}`,
      body: `${String(failedChannels.reduce((acc, c) => acc + c.failed, 0))} publicações falharam. Revise a integração e reprocesse.`,
      href: '/app/channels',
      action: 'Ver integração',
    });
  }
  if (overdue.length > 0) {
    alerts.push({
      tone: 'warning',
      icon: 'alertTriangle',
      title: `${String(overdue.length)} cobrança(s) vencida(s)`,
      body: `${formatBRLShort(overdue.reduce((acc, c) => acc + c.amountCents, 0))} em valores em aberto aguardam ação.`,
      href: '/app/charges',
      action: 'Ver cobranças',
    });
  }

  // ---- Fila de ações (minha fila) ----
  const queueRows: Array<{ id: string; type: string; title: string; meta: string; tone: 'info' | 'warning' | 'danger' | 'neutral'; due: string; href: string }> = [];
  for (const t of overdueTasks) {
    queueRows.push({ id: t.id, type: 'Tarefa', title: t.title, meta: t.relatedEntityType ?? 'Atrasada', tone: 'danger', due: formatDate(t.dueAt), href: '/app/crm/tasks' });
  }
  for (const t of todayTasks) {
    queueRows.push({ id: t.id, type: 'Tarefa', title: t.title, meta: t.relatedEntityType ?? 'Hoje', tone: 'info', due: formatDate(t.dueAt), href: '/app/crm/tasks' });
  }
  for (const c of overdue) {
    queueRows.push({ id: c.id, type: 'Cobrança', title: formatBRLShort(c.amountCents), meta: label(CHARGE_STATUS_LABELS, c.status), tone: 'danger', due: formatDate(c.dueDate), href: '/app/charges' });
  }
  for (const v of visits.filter((x) => x.status === 'SCHEDULED' || x.status === 'CONFIRMED').slice(0, 6)) {
    queueRows.push({ id: v.id, type: 'Visita', title: formatDate(v.scheduledAt), meta: label(VISIT_STATUS_LABELS, v.status), tone: VISIT_STATUS_TONES[v.status] === 'brand' ? 'info' : 'info', due: formatDate(v.scheduledAt), href: '/app/visits' });
  }
  queueRows.sort((a, b) => a.due.localeCompare(b.due));

  const firstName = me.user.name.split(' ')[0];

  return (
    <div className="app-page dashboard-page">
      {/* Header operacional */}
      <div className="dash-header">
        <div className="peg-stack" style={{ gap: 2 }}>
          <h1 className="app-page__title">Bom dia, {firstName}</h1>
          <p className="app-page__desc">
            {actionCount > 0
              ? `${String(actionCount)} ${actionCount === 1 ? 'item exige' : 'itens exigem'} ação hoje · ${String(overdue.length)} ${overdue.length === 1 ? 'vencimento financeiro' : 'vencimentos financeiros'} · ${String(failedChannels.length)} ${failedChannels.length === 1 ? 'integração com erro' : 'integrações com erro'}`
              : 'Nenhuma pendência operacional no momento.'}
          </p>
        </div>
        <div className="peg-group" style={{ gap: 8 }}>
          <Link href="/app/crm/calendar" className="peg-btn peg-btn--secondary peg-btn--sm">
            <Icon name="calendar" size={14} />
            <span className="peg-btn__label">Minha agenda</span>
          </Link>
          <Link href="/app/properties/new" className="peg-btn peg-btn--brand peg-btn--sm">
            <Icon name="plus" size={14} />
            <span className="peg-btn__label">Novo imóvel</span>
          </Link>
        </div>
      </div>

      {/* Alert strip — apenas quando há problema real */}
      {alerts.map((a) => (
        <div key={a.title} className={`dash-alert dash-alert--${a.tone}`} role={a.tone === 'danger' ? 'alert' : 'status'}>
          <span className="dash-alert__icon"><Icon name={a.icon} size={16} /></span>
          <div className="peg-stack" style={{ gap: 1, minWidth: 0, flex: 1 }}>
            <strong className="dash-alert__title">{a.title}</strong>
            <span className="dash-alert__body">{a.body}</span>
          </div>
          <Link href={a.href} className="dash-alert__action">{a.action}</Link>
        </div>
      ))}

      {/* Summary cards operacionais */}
      <div className="dash-grid">
        <SummaryCard title="CRM" href="/app/crm/leads" icon="users"
          rows={[
            { label: 'Novos leads hoje', value: newLeadsToday },
            { label: 'Sem atendimento', value: leadsWithoutOwner },
            { label: 'Aguardando resposta', value: awaitingResponse },
            { label: 'Atividades atrasadas', value: overdueTasks.length },
          ]} />
        <SummaryCard title="Imóveis" href="/app/properties" icon="home"
          rows={[
            { label: 'Disponíveis', value: available },
            { label: 'Publicações ativas', value: publishedListings },
            { label: 'Arquivados', value: archived },
            { label: 'Reservados', value: activeLeases },
          ]} />
        <SummaryCard title="Operação" href="/app/leases" icon="key"
          rows={[
            { label: 'Crédito pendente', value: screeningPending },
            { label: 'Contratos aguardando', value: contractPending },
            { label: 'Vistorias em aberto', value: inspectionsOpen },
            { label: 'Locações ativas', value: activeLeases },
          ]} />
        <SummaryCard title="Financeiro" href="/app/finance" icon="receipt"
          rows={[
            { label: 'Cobranças agendadas', value: scheduledCharges.length },
            { label: 'Em aberto', value: openCharges.length },
            { label: 'Vencidas', value: overdue.length },
            { label: 'Repasses pendentes', value: payoutsPending.length },
          ]} />
      </div>

      {/* Fila + coluna lateral */}
      <div className="dash-main">
        <section className="peg-card dash-card dash-queue">
          <header className="peg-card__header">
            <div className="peg-stack" style={{ gap: 0 }}>
              <h3 className="peg-card__title">Próximas ações · minha fila</h3>
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{queueRows.length} item(ns) exigem atenção</span>
            </div>
            <Link href="/app/crm/tasks" style={{ fontSize: 12, minHeight: 24, display: 'inline-flex', alignItems: 'center' }}>Ver tarefas</Link>
          </header>
          <div className="peg-stack" style={{ gap: 0 }}>
            {queueRows.length === 0 ? (
              <div className="peg-empty" style={{ padding: '20px 24px' }}>
                <span className="peg-empty__body">Nada pendente agora.</span>
              </div>
            ) : (
              queueRows.slice(0, 8).map((r) => (
                <Link key={`${r.type}-${r.id}`} href={r.href} className="dash-queue-row">
                  <span className="dash-queue-row__dot" style={{ background: toneDot(r.tone) }} />
                  <span className="dash-queue-row__type">{r.type}</span>
                  <span className="dash-queue-row__title">{r.title}</span>
                  <span className="dash-queue-row__meta">{r.meta}</span>
                  <span className="dash-queue-row__due">{r.due}</span>
                  <Icon name="chevronRight" size={14} className="dash-queue-row__chevron" />
                </Link>
              ))
            )}
          </div>
        </section>

        <div className="peg-stack" style={{ gap: 16 }}>
          {/* Ciclo de locação */}
          <section className="peg-card dash-card">
            <header className="peg-card__header">
              <h3 className="peg-card__title">Ciclo de locação · esta semana</h3>
            </header>
            <div className="peg-stack" style={{ gap: 10, padding: '14px 16px' }}>
              {cycle.map((s) => (
                <Link key={s.key} href={s.href} className="dash-cycle-row">
                  <span className="dash-cycle-row__label">{s.key}</span>
                  <span className="dash-cycle-row__bar-track">
                    <span
                      className="dash-cycle-row__bar"
                      style={{ width: `${String(Math.round((s.value / cycleMax) * 100))}%` }}
                    />
                  </span>
                  <span className="dash-cycle-row__value">{s.value}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Atendimento */}
          <section className="peg-card dash-card">
            <header className="peg-card__header">
              <div className="peg-stack" style={{ gap: 0 }}>
                <h3 className="peg-card__title">Atendimento</h3>
              </div>
              <Link href="/app/inbox" style={{ fontSize: 12, minHeight: 24, display: 'inline-flex', alignItems: 'center' }}>Inbox</Link>
            </header>
            <div className="peg-stack" style={{ gap: 0, padding: '6px 16px 12px' }}>
              <MetricRow label="Conversas aguardando" value={convOpen.length} tone="neutral" />
              <MetricRow label="Precisam de humano" value={convNeedsHuman} tone={convNeedsHuman > 0 ? 'danger' : 'neutral'} />
              <MetricRow label="Leads sem atendimento" value={leadsWithoutOwner} tone={leadsWithoutOwner > 0 ? 'warning' : 'neutral'} />
              <MetricRow label="Leads qualificados" value={qualified} tone="brand" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function overdueCharges(charges: ChargeDto[]): ChargeDto[] {
  return charges.filter((c) => c.status === 'OVERDUE');
}
function pendingSignatureCount(contracts: ContractDto[]): number {
  return contracts.filter((c) => c.status === 'SENT_FOR_SIGNATURE' || c.status === 'PARTIALLY_SIGNED').length;
}
function failedChannelCount(channels: Array<{ failed: number }>): number {
  return channels.reduce((acc, c) => acc + c.failed, 0);
}
function toneDot(tone: 'info' | 'warning' | 'danger' | 'neutral'): string {
  if (tone === 'danger') return 'var(--peg-danger)';
  if (tone === 'warning') return 'var(--peg-warning)';
  return 'var(--peg-border-strong)';
}

function SummaryCard({ title, href, icon, rows }: { title: string; href: string; icon: IconName; rows: Array<{ label: string; value: number }> }) {
  return (
    <Link href={href} className="peg-card dash-summary" style={{ textDecoration: 'none' }}>
      <header className="dash-summary__header">
        <span className="dash-summary__icon"><Icon name={icon} size={15} /></span>
        <h3 className="peg-card__title">{title}</h3>
        <span className="peg-spacer" />
        <Icon name="chevronRight" size={14} className="peg-text-tertiary" />
      </header>
      <div className="peg-stack" style={{ gap: 6, padding: '10px 16px 14px' }}>
        {rows.map((r) => (
          <div key={r.label} className="dash-summary__row">
            <span className="dash-summary__label">{r.label}</span>
            <span className="dash-summary__value">{r.value}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function MetricRow({ label: l, value, tone }: { label: string; value: number; tone: 'neutral' | 'danger' | 'warning' | 'brand' }) {
  const dot = tone === 'danger' ? 'var(--peg-danger)' : tone === 'warning' ? 'var(--peg-warning)' : tone === 'brand' ? 'var(--aluguei-brand)' : 'var(--peg-border-strong)';
  return (
    <div className="dash-metric-row">
      <span className="dash-metric-row__dot" style={{ background: dot }} />
      <span className="dash-metric-row__label">{l}</span>
      <span className="dash-metric-row__value">{value}</span>
    </div>
  );
}
