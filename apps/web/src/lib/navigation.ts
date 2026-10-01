import type { NavIconName } from '@/components/shell/nav-icon';
import type { Permission, PlanModule } from '@aluguei/domain';

export interface NavItem {
  href: string;
  label: string;
  /** Ícone do `Painel Sidebar.dc.html` (T8). */
  icon: NavIconName;
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
    // Atendimento comum a aluguel e venda: o lead chega antes de saber o departamento.
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
        icon: 'clip',
        permission: 'task:read',
        section: 'primary',
      },
      {
        href: '/app/crm/calendar',
        module: 'CRM',
        label: 'Agenda',
        icon: 'cal',
        permission: 'visit:read',
        section: 'primary',
      },
      {
        href: '/app/inbox',
        module: 'ATENDIMENTO',
        label: 'Inbox',
        icon: 'chat',
        permission: 'conversation:read',
        section: 'primary',
      },
      {
        href: '/app/visits',
        module: 'CRM',
        label: 'Visitas',
        icon: 'clock',
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
        icon: 'mega',
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
        activePrefixes: ['/app/channels/'],
      },
    ],
  },
  {
    // Departamento de aluguel: o ciclo da locação, da proposta ao contrato ativo.
    title: 'Aluguel',
    items: [
      {
        href: '/app/proposals',
        module: 'CRM',
        label: 'Propostas',
        icon: 'hand',
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
        icon: 'file',
        permission: 'contract:read',
        section: 'primary',
        activePrefixes: ['/app/contracts', '/app/contract-templates'],
      },
      {
        href: '/app/inspections',
        module: 'LOCACAO',
        label: 'Vistorias',
        icon: 'cam',
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
    // Vendas (Onda 5): o design só tem Negociações (T9). O painel de vendas continua em
    // `/app/vendas`, pelo link no cabeçalho de Negociações, e acende o mesmo item.
    title: 'Vendas',
    items: [
      {
        href: '/app/vendas/negociacoes',
        label: 'Negociações',
        icon: 'tag',
        permission: 'lead:read',
        section: 'primary',
        module: 'VENDAS',
        novo: true,
        activePrefixes: ['/app/vendas'],
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
        icon: 'bar',
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
        icon: 'card',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/payouts',
        module: 'FINANCEIRO',
        label: 'Repasses',
        icon: 'trend',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/reconciliation',
        module: 'FINANCEIRO',
        label: 'Conciliação',
        icon: 'check',
        permission: 'finance:read',
        section: 'primary',
      },
      {
        href: '/app/ledger',
        module: 'FINANCEIRO',
        label: 'Ledger',
        icon: 'db',
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
        icon: 'mega',
        permission: 'meta:read',
        section: 'primary',
        activePrefixes: ['/app/marketing', '/app/meta'],
      },
      {
        href: '/app/reporting',
        label: 'Relatórios',
        icon: 'pie',
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
        icon: 'gear',
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
  if (group) crumbs.push({ label: group.title });
  crumbs.push({ label: item.label });
  return crumbs;
}
