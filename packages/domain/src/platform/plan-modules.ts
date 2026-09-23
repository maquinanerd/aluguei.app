import { DomainError } from '../errors.js';

/**
 * Módulos do sistema que um plano pode incluir (entrega de design AchouImóvel,
 * 22/09/2026). O que fica de fora do plano aparece com cadeado no menu e abre a
 * tela "Fora do seu plano"; a API recusa com 403 e
 * `details.reason = PLAN_MODULE_NOT_INCLUDED`.
 *
 * Não exigem módulo (base de todo plano, inclusive o Anunciante): imóveis,
 * anúncios e canais, leads, contatos, tarefas, relatórios, configurações e a
 * administração da própria imobiliária.
 */
export const PLAN_MODULES = [
  /** Funil, agenda, visitas e propostas. */
  'CRM',
  /** Caixa de entrada do WhatsApp e conversas. */
  'ATENDIMENTO',
  /** Análise cadastral, contratos, vistorias e locações. */
  'LOCACAO',
  /** Cobranças, pagamentos, repasses, conciliação e contabilidade. */
  'FINANCEIRO',
  /** Negociações de venda e painel de vendas. */
  'VENDAS',
  /** Campanhas de Meta Ads. */
  'MARKETING',
] as const;

export type PlanModule = (typeof PLAN_MODULES)[number];

const MODULE_LABELS: Record<PlanModule, string> = {
  CRM: 'CRM',
  ATENDIMENTO: 'Atendimento',
  LOCACAO: 'Locação',
  FINANCEIRO: 'Financeiro',
  VENDAS: 'Vendas',
  MARKETING: 'Marketing',
};

export function isPlanModule(value: string): value is PlanModule {
  return (PLAN_MODULES as readonly string[]).includes(value);
}

export function planIncludesModule(modules: readonly string[], module: PlanModule): boolean {
  return modules.includes(module);
}

/**
 * Recusa (403) o módulo que o plano não inclui. O `reason` é o contrato com a
 * interface: o painel mostra a tela de upgrade em vez do erro genérico.
 */
export function assertPlanIncludesModule(modules: readonly string[], module: PlanModule): void {
  if (!planIncludesModule(modules, module)) {
    throw new DomainError('FORBIDDEN', `Módulo fora do seu plano: ${MODULE_LABELS[module]}`, {
      reason: 'PLAN_MODULE_NOT_INCLUDED',
      module,
    });
  }
}

/** Só os códigos conhecidos, sem repetição e na ordem de `PLAN_MODULES`. */
export function normalizePlanModules(modules: readonly string[]): PlanModule[] {
  return PLAN_MODULES.filter((module) => modules.includes(module));
}
