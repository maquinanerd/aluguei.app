import type { IconName } from '@aluguei/ui';
import type { Permission } from '@aluguei/domain';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  permission?: Permission;
  /** Badge numérica opcional (dados reais apenas; sem inventar). */
  badge?: number;
  /** Tons: danger para erro semântico, default neutro. */
  badgeTone?: 'neutral' | 'danger';
  section: 'primary' | 'admin';
  activePrefixes?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Item raiz (Visão Geral) fora dos grupos — mockup: item solto no topo. */
export const NAV_ROOT: readonly NavItem[] = [
  { href: '/app', label: 'Visão Geral', icon: 'layout', section: 'primary' },
];

/** Navegação do painel — reflete capabilities reais do backend (Fase 01 matrix). */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'CRM',
    items: [
      { href: '/app/crm/leads', label: 'Leads', icon: 'users', permission: 'lead:read', section: 'primary', activePrefixes: ['/app/crm/leads'] },
      { href: '/app/crm/contacts', label: 'Contatos', icon: 'user', permission: 'lead:read', section: 'primary', activePrefixes: ['/app/crm/contacts'] },
      { href: '/app/crm/pipeline', label: 'Pipeline', icon: 'columns', permission: 'lead:read', section: 'primary' },
      { href: '/app/crm/tasks', label: 'Tarefas', icon: 'clipboardList', permission: 'task:read', section: 'primary' },
      { href: '/app/crm/calendar', label: 'Agenda', icon: 'calendar', permission: 'visit:read', section: 'primary' },
    ],
  },
  {
    title: 'Imóveis',
    items: [
      { href: '/app/properties', label: 'Imóveis', icon: 'home', permission: 'property:read', section: 'primary', activePrefixes: ['/app/properties'] },
      { href: '/app/listings', label: 'Anúncios', icon: 'megaphone', permission: 'listing:read', section: 'primary', activePrefixes: ['/app/listings'] },
      { href: '/app/channels', label: 'Canais', icon: 'share', permission: 'listing:read', section: 'primary' },
    ],
  },
  {
    title: 'Operação',
    items: [
      { href: '/app/inbox', label: 'Inbox', icon: 'messageCircle', permission: 'conversation:read', section: 'primary' },
      { href: '/app/visits', label: 'Visitas', icon: 'calendarClock', permission: 'visit:read', section: 'primary' },
      { href: '/app/proposals', label: 'Propostas', icon: 'handshake', permission: 'proposal:read', section: 'primary' },
      { href: '/app/screening', label: 'Crédito', icon: 'shield', permission: 'screening:read', section: 'primary', activePrefixes: ['/app/screening', '/app/rental-applications'] },
      { href: '/app/contracts', label: 'Contratos', icon: 'fileText', permission: 'contract:read', section: 'primary', activePrefixes: ['/app/contracts', '/app/contract-templates'] },
      { href: '/app/inspections', label: 'Vistorias', icon: 'camera', permission: 'inspection:read', section: 'primary' },
      { href: '/app/leases', label: 'Locações', icon: 'key', permission: 'finance:read', section: 'primary' },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { href: '/app/finance', label: 'Visão Geral', icon: 'barChart', permission: 'finance:read', section: 'primary' },
      { href: '/app/charges', label: 'Cobranças', icon: 'receipt', permission: 'finance:read', section: 'primary' },
      { href: '/app/payments', label: 'Pagamentos', icon: 'creditCard', permission: 'finance:read', section: 'primary' },
      { href: '/app/payouts', label: 'Repasses', icon: 'trendingUp', permission: 'finance:read', section: 'primary' },
      { href: '/app/reconciliation', label: 'Conciliação', icon: 'checkCircle', permission: 'finance:read', section: 'primary' },
      { href: '/app/ledger', label: 'Ledger', icon: 'database', permission: 'finance:read', section: 'primary' },
    ],
  },
  {
    title: 'Crescimento',
    items: [
      { href: '/app/marketing', label: 'Marketing', icon: 'megaphone', permission: 'meta:read', section: 'primary', activePrefixes: ['/app/marketing', '/app/meta'] },
      { href: '/app/reporting', label: 'Relatórios', icon: 'pieChart', permission: 'report:read', section: 'primary' },
    ],
  },
  {
    title: 'Administração',
    items: [
      { href: '/app/admin/members', label: 'Usuários e equipe', icon: 'users', permission: 'member:read', section: 'admin' },
      { href: '/app/admin/integrations', label: 'Integrações', icon: 'globe', permission: 'org:manage', section: 'admin' },
      { href: '/app/settings', label: 'Configurações', icon: 'settings', permission: 'org:manage', section: 'admin' },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | null {
  for (const item of NAV_ROOT) {
    if (pathname === item.href || item.activePrefixes?.some((p) => pathname.startsWith(p))) return item;
  }
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href) return item;
      if (item.activePrefixes?.some((p) => pathname.startsWith(p))) return item;
    }
  }
  return null;
}

/** Breadcrumbs padrão por rota (pai → filho). */
export function breadcrumbFor(pathname: string): { label: string; href?: string }[] {
  const item = findNavItem(pathname);
  if (!item) return [{ label: 'Painel', href: '/app' }];
  const root = NAV_ROOT.find((i) => i === item);
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i === item));
  const crumbs: { label: string; href?: string }[] = [{ label: 'Painel', href: '/app' }];
  if (root) {
    crumbs.push({ label: root.label });
    return crumbs;
  }
  if (group && group.title !== 'Operação') {
    crumbs.push({ label: group.title });
  }
  crumbs.push({ label: item.label });
  return crumbs;
}
