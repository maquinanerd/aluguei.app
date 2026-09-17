import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';
import { Icon } from '@aluguei/ui';
import type { IconName } from '@aluguei/ui';
import { formatBRLShort, formatDate } from '@aluguei/ui';
import {
  label,
  CHANNEL_TYPE_LABELS,
  CHARGE_STATUS_LABELS,
  VISIT_STATUS_LABELS,
} from '@/lib/labels';

export const metadata: Metadata = { title: 'Visão Geral | Aluguei.app' };
export const dynamic = 'force-dynamic';

interface MeDto {
  user: { id: string; name: string; email: string };
}

interface TaskItemDto {
  id: string;
  title: string;
  dueAt: string | null;
  relatedEntityType: string | null;
}

/**
 * Resposta de GET /dashboard/summary (apps/api/src/routes/dashboard.ts). Seção
 * `null` = sem permissão de leitura: a tela mostra "—", nunca zero.
 */
interface DashboardSummaryDto {
  generatedAt: string;
  crm: {
    openLeads: number;
    newLeadsToday: number;
    leadsWithoutOwner: number;
    awaitingResponse: number;
    qualified: number;
  } | null;
  tasks: {
    overdue: number;
    dueToday: number;
    overdueItems: TaskItemDto[];
    dueTodayItems: TaskItemDto[];
  } | null;
  visits: {
    active: number;
    upcomingItems: Array<{ id: string; scheduledAt: string; status: string }>;
  } | null;
  proposals: { nonDraft: number } | null;
  properties: { available: number; archived: number } | null;
  listings: {
    publishedPublications: number;
    failedPublications: number;
    failedByChannel: Array<{ channel: string; failed: number }>;
  } | null;
  screening: { total: number; pending: number } | null;
  contracts: { nonVoid: number; pending: number; awaitingSignature: number } | null;
  inspections: { open: number } | null;
  finance: {
    activeLeases: number;
    nonEndedLeases: number;
    scheduledCharges: number;
    openCharges: number;
    overdueCharges: number;
    overdueAmountCents: number;
    pendingPayouts: number;
    overdueItems: Array<{ id: string; amountCents: number; status: string; dueDate: string }>;
  } | null;
  conversations: { open: number; needsHuman: number } | null;
}

type Tone = 'info' | 'warning' | 'danger' | 'neutral';

function sumKnown(values: ReadonlyArray<number | undefined>): number {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export default async function OverviewPage() {
  let me: MeDto;
  try {
    me = await apiFetch<MeDto>('/auth/me');
  } catch {
    redirect('/login');
  }

  // Números agregados no banco pela API (auditoria 2026-09-10, P1-01): antes a
  // página buscava 12 listagens com limit=200, recusadas pela API, e mostrava
  // tudo zerado com dados existentes.
  let summary: DashboardSummaryDto | null;
  try {
    summary = await apiFetch<DashboardSummaryDto>('/dashboard/summary');
  } catch {
    summary = null;
  }

  const crm = summary?.crm ?? null;
  const tasks = summary?.tasks ?? null;
  const visits = summary?.visits ?? null;
  const listings = summary?.listings ?? null;
  const screening = summary?.screening ?? null;
  const contracts = summary?.contracts ?? null;
  const inspections = summary?.inspections ?? null;
  const finance = summary?.finance ?? null;
  const conversations = summary?.conversations ?? null;

  const actionCount = sumKnown([
    tasks?.overdue,
    tasks?.dueToday,
    crm?.leadsWithoutOwner,
    finance?.overdueCharges,
    contracts?.awaitingSignature,
    listings?.failedPublications,
  ]);
  const failedChannels = (listings?.failedByChannel ?? []).filter((c) => c.failed > 0);

  let headline: string;
  if (summary === null) {
    headline = 'Não foi possível carregar os indicadores agora.';
  } else if (actionCount === 0) {
    headline = 'Nenhuma pendência operacional no momento.';
  } else {
    const parts = [`${plural(actionCount, 'item exige', 'itens exigem')} ação hoje`];
    if (finance) {
      parts.push(
        plural(finance.overdueCharges, 'vencimento financeiro', 'vencimentos financeiros'),
      );
    }
    if (listings) {
      parts.push(plural(failedChannels.length, 'integração com erro', 'integrações com erro'));
    }
    headline = parts.join(' · ');
  }

  // ---- Ciclo de locação ----
  const cycle: Array<{ key: string; value: number | null; href: string }> = [
    { key: 'Leads', value: crm?.openLeads ?? null, href: '/app/crm/leads' },
    { key: 'Qualif.', value: crm?.qualified ?? null, href: '/app/crm/pipeline' },
    { key: 'Visitas', value: visits?.active ?? null, href: '/app/visits' },
    {
      key: 'Propostas',
      value: summary?.proposals?.nonDraft ?? null,
      href: '/app/proposals',
    },
    { key: 'Crédito', value: screening?.total ?? null, href: '/app/screening' },
    { key: 'Contrato', value: contracts?.nonVoid ?? null, href: '/app/contracts' },
    { key: 'Locação', value: finance?.nonEndedLeases ?? null, href: '/app/leases' },
  ];
  const cycleMax = Math.max(1, ...cycle.map((c) => c.value ?? 0));

  // ---- Alertas reais ----
  const alerts: Array<{
    tone: 'warning' | 'danger';
    icon: IconName;
    title: string;
    body: string;
    href: string;
    action: string;
  }> = [];
  if (summary === null) {
    alerts.push({
      tone: 'warning',
      icon: 'alertTriangle',
      title: 'Indicadores indisponíveis',
      body: 'A API não respondeu. Os números abaixo aparecem como "—" até a próxima carga.',
      href: '/app',
      action: 'Recarregar',
    });
  }
  if (failedChannels.length > 0) {
    const names = failedChannels.map((c) => label(CHANNEL_TYPE_LABELS, c.channel)).join(', ');
    alerts.push({
      tone: 'danger',
      icon: 'alertTriangle',
      title: `Falha de sincronização: ${names}`,
      body: `${String(listings?.failedPublications ?? 0)} publicações falharam. Revise a integração e reprocesse.`,
      href: '/app/channels',
      action: 'Ver integração',
    });
  }
  if (finance && finance.overdueCharges > 0) {
    alerts.push({
      tone: 'warning',
      icon: 'alertTriangle',
      title: `${String(finance.overdueCharges)} cobrança(s) vencida(s)`,
      body: `${formatBRLShort(finance.overdueAmountCents)} em valores em aberto aguardam ação.`,
      href: '/app/charges',
      action: 'Ver cobranças',
    });
  }

  // ---- Fila de ações (minha fila) ----
  const queueRows: Array<{
    id: string;
    type: string;
    title: string;
    meta: string;
    tone: Tone;
    sortKey: string;
    due: string;
    href: string;
  }> = [];
  for (const t of tasks?.overdueItems ?? []) {
    queueRows.push({
      id: t.id,
      type: 'Tarefa',
      title: t.title,
      meta: t.relatedEntityType ?? 'Atrasada',
      tone: 'danger',
      sortKey: t.dueAt ?? '',
      due: formatDate(t.dueAt),
      href: '/app/crm/tasks',
    });
  }
  for (const t of tasks?.dueTodayItems ?? []) {
    queueRows.push({
      id: t.id,
      type: 'Tarefa',
      title: t.title,
      meta: t.relatedEntityType ?? 'Hoje',
      tone: 'info',
      sortKey: t.dueAt ?? '',
      due: formatDate(t.dueAt),
      href: '/app/crm/tasks',
    });
  }
  for (const c of finance?.overdueItems ?? []) {
    queueRows.push({
      id: c.id,
      type: 'Cobrança',
      title: formatBRLShort(c.amountCents),
      meta: label(CHARGE_STATUS_LABELS, c.status),
      tone: 'danger',
      sortKey: c.dueDate,
      due: formatDate(c.dueDate),
      href: '/app/charges',
    });
  }
  for (const v of visits?.upcomingItems ?? []) {
    queueRows.push({
      id: v.id,
      type: 'Visita',
      title: formatDate(v.scheduledAt),
      meta: label(VISIT_STATUS_LABELS, v.status),
      tone: 'info',
      sortKey: v.scheduledAt,
      due: formatDate(v.scheduledAt),
      href: '/app/visits',
    });
  }
  queueRows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const queueTotal = sumKnown([
    tasks?.overdue,
    tasks?.dueToday,
    finance?.overdueCharges,
    visits?.upcomingItems.length,
  ]);

  const firstName = me.user.name.split(' ')[0];

  return (
    <div className="app-page dashboard-page">
      {/* Header operacional */}
      <div className="dash-header">
        <div className="peg-stack" style={{ gap: 2 }}>
          <h1 className="app-page__title">Bom dia, {firstName}</h1>
          <p className="app-page__desc">{headline}</p>
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
        <div
          key={a.title}
          className={`dash-alert dash-alert--${a.tone}`}
          role={a.tone === 'danger' ? 'alert' : 'status'}
        >
          <span className="dash-alert__icon">
            <Icon name={a.icon} size={16} />
          </span>
          <div className="peg-stack" style={{ gap: 1, minWidth: 0, flex: 1 }}>
            <strong className="dash-alert__title">{a.title}</strong>
            <span className="dash-alert__body">{a.body}</span>
          </div>
          <Link href={a.href} className="dash-alert__action">
            {a.action}
          </Link>
        </div>
      ))}

      {/* Summary cards operacionais */}
      <div className="dash-grid">
        <SummaryCard
          title="CRM"
          href="/app/crm/leads"
          icon="users"
          rows={[
            { label: 'Novos leads hoje', value: crm?.newLeadsToday ?? null },
            { label: 'Sem atendimento', value: crm?.leadsWithoutOwner ?? null },
            { label: 'Aguardando resposta', value: crm?.awaitingResponse ?? null },
            { label: 'Atividades atrasadas', value: tasks?.overdue ?? null },
          ]}
        />
        <SummaryCard
          title="Imóveis"
          href="/app/properties"
          icon="home"
          rows={[
            { label: 'Disponíveis', value: summary?.properties?.available ?? null },
            { label: 'Publicações ativas', value: listings?.publishedPublications ?? null },
            { label: 'Arquivados', value: summary?.properties?.archived ?? null },
            { label: 'Reservados', value: finance?.activeLeases ?? null },
          ]}
        />
        <SummaryCard
          title="Operação"
          href="/app/leases"
          icon="key"
          rows={[
            { label: 'Crédito pendente', value: screening?.pending ?? null },
            { label: 'Contratos aguardando', value: contracts?.pending ?? null },
            { label: 'Vistorias em aberto', value: inspections?.open ?? null },
            { label: 'Locações ativas', value: finance?.activeLeases ?? null },
          ]}
        />
        <SummaryCard
          title="Financeiro"
          href="/app/finance"
          icon="receipt"
          rows={[
            { label: 'Cobranças agendadas', value: finance?.scheduledCharges ?? null },
            { label: 'Em aberto', value: finance?.openCharges ?? null },
            { label: 'Vencidas', value: finance?.overdueCharges ?? null },
            { label: 'Repasses pendentes', value: finance?.pendingPayouts ?? null },
          ]}
        />
      </div>

      {/* Fila + coluna lateral */}
      <div className="dash-main">
        <section className="peg-card dash-card dash-queue">
          <header className="peg-card__header">
            <div className="peg-stack" style={{ gap: 0 }}>
              <h3 className="peg-card__title">Próximas ações · minha fila</h3>
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                {queueTotal} item(ns) exigem atenção
              </span>
            </div>
            <Link
              href="/app/crm/tasks"
              style={{ fontSize: 12, minHeight: 24, display: 'inline-flex', alignItems: 'center' }}
            >
              Ver tarefas
            </Link>
          </header>
          <div className="peg-stack" style={{ gap: 0 }}>
            {queueRows.length === 0 ? (
              <div className="peg-empty" style={{ padding: '20px 24px' }}>
                <span className="peg-empty__body">
                  {summary === null ? 'Fila indisponível no momento.' : 'Nada pendente agora.'}
                </span>
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
              <h3 className="peg-card__title">Ciclo de locação</h3>
            </header>
            <div className="peg-stack" style={{ gap: 10, padding: '14px 16px' }}>
              {cycle.map((s) => (
                <Link key={s.key} href={s.href} className="dash-cycle-row">
                  <span className="dash-cycle-row__label">{s.key}</span>
                  <span className="dash-cycle-row__bar-track">
                    <span
                      className="dash-cycle-row__bar"
                      style={{
                        width: `${String(Math.round(((s.value ?? 0) / cycleMax) * 100))}%`,
                      }}
                    />
                  </span>
                  <span className="dash-cycle-row__value">{displayCount(s.value)}</span>
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
              <Link
                href="/app/inbox"
                style={{
                  fontSize: 12,
                  minHeight: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Inbox
              </Link>
            </header>
            <div className="peg-stack" style={{ gap: 0, padding: '6px 16px 12px' }}>
              <MetricRow
                label="Conversas aguardando"
                value={conversations?.open ?? null}
                tone="neutral"
              />
              <MetricRow
                label="Precisam de humano"
                value={conversations?.needsHuman ?? null}
                tone={(conversations?.needsHuman ?? 0) > 0 ? 'danger' : 'neutral'}
              />
              <MetricRow
                label="Leads sem atendimento"
                value={crm?.leadsWithoutOwner ?? null}
                tone={(crm?.leadsWithoutOwner ?? 0) > 0 ? 'warning' : 'neutral'}
              />
              <MetricRow label="Leads qualificados" value={crm?.qualified ?? null} tone="brand" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Contagem conhecida ou "—" (sem permissão ou API indisponível): nunca um zero inventado. */
function displayCount(value: number | null): string {
  return value === null ? '—' : String(value);
}

function toneDot(tone: Tone): string {
  if (tone === 'danger') return 'var(--peg-danger)';
  if (tone === 'warning') return 'var(--peg-warning)';
  return 'var(--peg-border-strong)';
}

function SummaryCard({
  title,
  href,
  icon,
  rows,
}: {
  title: string;
  href: string;
  icon: IconName;
  rows: Array<{ label: string; value: number | null }>;
}) {
  return (
    <Link href={href} className="peg-card dash-summary" style={{ textDecoration: 'none' }}>
      <header className="dash-summary__header">
        <span className="dash-summary__icon">
          <Icon name={icon} size={15} />
        </span>
        <h3 className="peg-card__title">{title}</h3>
        <span className="peg-spacer" />
        <Icon name="chevronRight" size={14} className="peg-text-tertiary" />
      </header>
      <div className="peg-stack" style={{ gap: 6, padding: '10px 16px 14px' }}>
        {rows.map((r) => (
          <div key={r.label} className="dash-summary__row">
            <span className="dash-summary__label">{r.label}</span>
            <span className="dash-summary__value">{displayCount(r.value)}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function MetricRow({
  label: l,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'neutral' | 'danger' | 'warning' | 'brand';
}) {
  const dot =
    tone === 'danger'
      ? 'var(--peg-danger)'
      : tone === 'warning'
        ? 'var(--peg-warning)'
        : tone === 'brand'
          ? 'var(--aluguei-brand)'
          : 'var(--peg-border-strong)';
  return (
    <div className="dash-metric-row">
      <span className="dash-metric-row__dot" style={{ background: dot }} />
      <span className="dash-metric-row__label">{l}</span>
      <span className="dash-metric-row__value">{displayCount(value)}</span>
    </div>
  );
}
