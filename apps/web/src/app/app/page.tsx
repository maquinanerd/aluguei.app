import type { Metadata } from 'next';
import { Breadcrumb, Card, Kpi, Group, Icon } from '@aluguei/ui';

export const metadata: Metadata = { title: 'Visão Geral | Aluguei.app' };

export default function OverviewPage() {
  return (
    <div className="app-page">
      <div>
        <h1 className="app-page__title">Visão Geral</h1>
        <p className="app-page__desc">Central de trabalho operacional do Aluguei.app.</p>
      </div>

      <div className="peg-grid cols-4">
        <Kpi label="Leads novos" value="—" icon="users" />
        <Kpi label="Visitas hoje" value="—" icon="calendarClock" />
        <Kpi label="Imóveis ativos" value="—" icon="home" />
        <Kpi label="Cobranças em aberto" value="—" icon="receipt" />
      </div>

      <Card title="Acesso rápido" padless>
        <Group gap={3} wrap style={{ padding: 16 }}>
          {[
            { label: 'Leads', icon: 'users', href: '/app/crm/leads' },
            { label: 'Imóveis', icon: 'home', href: '/app/properties' },
            { label: 'Visitas', icon: 'calendarClock', href: '/app/visits' },
            { label: 'Cobranças', icon: 'receipt', href: '/app/charges' },
          ].map((q) => (
            <a key={q.href} href={q.href} className="peg-group" style={{ gap: 8, padding: '6px 12px', borderRadius: 'var(--peg-radius-sm)', color: 'var(--peg-text-primary)', fontSize: 13 }}>
              <Icon name={q.icon as 'users'} size={16} />
              {q.label}
            </a>
          ))}
        </Group>
      </Card>
      <Breadcrumb items={[{ label: 'Painel' }, { label: 'Visão Geral' }]} />
    </div>
  );
}
