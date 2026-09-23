import type { IconName } from '@aluguei/ui';
import type { Permission, PlanModule } from '@aluguei/domain';

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
  /**
   * Módulo do plano que abre este item. Sem o módulo, o item aparece com cadeado
   * e leva para a tela "Fora do seu plano" (ADR-095). Item sem módulo é base de
   * todo plano, inclusive o Anunciante.
   */
  module?: PlanModule;
  /** Etiqueta "Novo" na entrega de design. */
  novo?: boolean;
  /** Tela ainda não construída: o item explica em vez de levar a um 404. */
  emPreparacao?: boolean;
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
      {
        href: '/app/crm/leads',
        label: 'Leads',
        icon: 'users',
        permission: 'lead:read',
        section: 'primary',
        activePrefixes: ['/app/crm/leads'],
      },
      {
        href: '/app/crm/contacts',
        label: 'Contatos',
        icon: 'user',
        permission: 'lead:read',
        section: 'primary',
        activePrefixes: ['/app/crm/contacts'],
      },
      {
        href: '/app/crm/pipeline',
        module: 'CRM',
        label: 'Pipeline',
        icon: 'columns',
        permission: 'lead:read',
        section: 'primary',
      },
      {
        href: '/app/crm/tasks',
        label: 'Tarefas',
        icon: 'clipboardList',
        permission: 'task:read',
        section: 'primary',
      },
      {
        href: '/app/crm/calendar',
        module: 'CRM',
        label: 'Agenda',
        icon: 'calendar',
        permission: 'visit:read',
        section: 'primary',
      },
    ],
  },
  {
    title: 'Imóveis',
    items: [
      {
        href: '/app/properties',
        label: 'Imóveis',
        icon: 'home',
        permission: 'property:read',
        section: 'primary',
        activePrefixes: ['/app/properties'],
      },
      {
        href: '/app/listings',
        label: 'Anúncios',
        icon: 'megaphone',
        permission: 'listing:read',
        section: 'primary',
        activePrefixes: ['/app/listings'],
      },
      {
        href: '/app/channels',
        label: 'Canais',
        icon: 'share',
        permission: 'listing:read',
        section: 'primary',
      },
    ],
  },
  {
    // Vendas (entrega de design): o módulo existe no plano, as telas chegam na
    // fase de Vendas (ADR-097). Até lá o item explica em vez de levar a um 404.
    title: 'Vendas',
    items: [
      {
        href: '/app/vendas/negociacoes',
        label: 'Negociações',
        icon: 'columns',
        permission: 'lead:read',
        section: 'primary',
        module: 'VENDAS',
        novo: true,
        emPreparacao: true,
        activePrefixes: ['/app/vendas'],
      },
    ],
  },
  {
    title: 'Operação',
    items: [
      {
        href: '/app/inbox',
        module: 'ATENDIMENTO',
        label: 'Inbox',
        icon: 'messageCircle',
        permission: 'conversation:read',
        section: 'primary',
      },
      {
        href: '/app/visits',
        module: 'CRM',
        label: 'Visitas',
        icon: 'calendarClock',
        permission: 'visit:read',
        section: 'primary',
      },
      {
        href: '/app/proposals',
        module: 'CRM',
        label: 'Propostas',
        icon: 'handshake',
        permission: 'proposal:read',
        section: 'primary',
      },
      {
        href: '/app/screening',
        module: 'LOCACAO',
        label: 'Crédito',
        icon: 'shield',
        permission: 'screening:read',
        section: 'primary',
        activePrefixes: ['/app/screening', '/app/rental-applications'],
      },
      {
        href: '/app/contracts',
        module: 'LOCACAO',
        label: 'Contratos',
        icon: 'fileText',
        permission: 'contract:read',
        section: 'primary',
        activePrefixes: ['/app/contracts', '/app/contract-templates'],
      },
      {
        href: '/app/inspections',
        module: 'LOCACAO',
        label: 'Vistorias',
        icon: 'camera',
        permission: 'inspection:read',
        section: 'primary',
      },
      {
        href: '/app/leases',
        module: 'LOCACAO',
        label: 'Locações',
        icon: 'key',
        permission: 'finance:read',
        section: 'primary',
      },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      {
        href: '/app/finance',
        module: 'FINANCEIRO',
        label: 'Visão Geral',
        icon: 'barChart',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/charges',
        module: 'FINANCEIRO',
        label: 'Cobranças',
        icon: 'receipt',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/payments',
        module: 'FINANCEIRO',
        label: 'Pagamentos',
        icon: 'creditCard',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/payouts',
        module: 'FINANCEIRO',
        label: 'Repasses',
        icon: 'trendingUp',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/reconciliation',
        module: 'FINANCEIRO',
        label: 'Conciliação',
        icon: 'checkCircle',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/ledger',
        module: 'FINANCEIRO',
        label: 'Ledger',
        icon: 'database',
        permission: 'finance:read',
        section: 'primary',
      },
    ],
  },
  {
    title: 'Crescimento',
    items: [
      {
        href: '/app/marketing',
        module: 'MARKETING',
        label: 'Marketing',
        icon: 'megaphone',
        permission: 'meta:read',
        section: 'primary',
        activePrefixes: ['/app/marketing', '/app/meta'],
      },
      {
        href: '/app/reporting',
        label: 'Relatórios',
        icon: 'pieChart',
        permission: 'report:read',
        section: 'primary',
      },
    ],
  },
  {
    title: 'Administração',
    items: [
      {
        href: '/app/admin/members',
        label: 'Usuários e equipe',
        icon: 'users',
        permission: 'member:read',
        section: 'admin',
      },
      {
        href: '/app/admin/integrations',
        label: 'Integrações',
        icon: 'globe',
        permission: 'org:manage',
        section: 'admin',
      },
      {
        href: '/app/settings',
        label: 'Configurações',
        icon: 'settings',
        permission: 'org:manage',
        section: 'admin',
      },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | null {
  for (const item of NAV_ROOT) {
    if (pathname === item.href || item.activePrefixes?.some((p) => pathname.startsWith(p)))
      return item;
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
