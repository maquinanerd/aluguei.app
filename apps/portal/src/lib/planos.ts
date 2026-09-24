import type { PublicPlan } from '@aluguei/contracts';
import { formatarValorExato } from './formato';

/**
 * Tabela de planos do B2B (`/planos` e `/para-imobiliarias`).
 *
 * As **colunas** vêm da API (`GET /public/plans`): nome, preço e limites são
 * dado, nunca texto fixo na página — é a regra do AGENTS.md sobre número
 * inventado, e preço de plano é o número mais sensível de uma página dessas.
 *
 * As **linhas** são a lista de recursos da tela de referência, e o "Incluído /
 * —" de cada célula é derivado dos módulos do plano. Assim, criar um plano novo
 * no painel já preenche a tabela certa, sem ninguém editar o portal.
 */

/** Módulo que libera o recurso; `null` = está em todo plano. */
export interface RecursoDoPlano {
  nome: string;
  descricao: string;
  modulo: string | null;
  /** Recurso implementado mas ainda não ligado de verdade (selo "em breve"). */
  emBreve?: boolean;
}

export const RECURSOS: RecursoDoPlano[] = [
  {
    nome: 'Anúncios no portal',
    descricao: 'Publicação no AchouImóvel',
    modulo: null,
  },
  {
    nome: 'Leads e contatos',
    descricao: 'Caixa de leads, contatos e tarefas',
    modulo: null,
  },
  { nome: 'CRM', descricao: 'Funil, visitas e propostas', modulo: 'CRM' },
  {
    nome: 'Atendimento no WhatsApp',
    descricao: 'Conexão, atendimento automático e caixa de entrada',
    modulo: 'ATENDIMENTO',
  },
  {
    nome: 'Portais parceiros',
    descricao: 'Canal Pro (ZAP e VivaReal), OLX e Imovelweb',
    modulo: null,
  },
  {
    nome: 'Análise cadastral',
    descricao: 'Candidatura com autorização LGPD',
    modulo: 'LOCACAO',
  },
  {
    nome: 'Contratos e assinatura',
    descricao: 'Modelos versionados e envelope',
    modulo: 'LOCACAO',
    emBreve: true,
  },
  {
    nome: 'Vistoria',
    descricao: 'Ambientes, fotos, áudio e relatório',
    modulo: 'LOCACAO',
  },
  {
    nome: 'Financeiro',
    descricao: 'Cobrança, split, repasse e conciliação',
    modulo: 'FINANCEIRO',
    emBreve: true,
  },
  {
    nome: 'Área do cliente',
    descricao: 'Proprietário e inquilino',
    modulo: 'LOCACAO',
  },
  {
    nome: 'Negociação de venda',
    descricao: 'Proposta, contraproposta e comissão',
    modulo: 'VENDAS',
  },
];

type ModuloDoPlano = PublicPlan['modules'][number];

export function planoTemRecurso(plano: PublicPlan, recurso: RecursoDoPlano): boolean {
  if (recurso.modulo === null) {
    return true;
  }
  return (plano.modules as readonly string[]).includes(recurso.modulo);
}

/** Módulos que o plano inclui, na ordem do contrato. */
export function modulosDoPlano(plano: PublicPlan): ModuloDoPlano[] {
  return [...plano.modules];
}

/**
 * Preço da coluna. Sem preço publicado **não** é zero nem "grátis": é "Fale com
 * a gente", que é o que a imobiliária vê hoje enquanto a cobrança real não entra.
 */
export function precoDoPlano(plano: PublicPlan): { valor: string; porMes: boolean } {
  if (plano.monthlyPriceCents === null) {
    return { valor: 'Fale com a gente', porMes: false };
  }
  return { valor: formatarValorExato(plano.monthlyPriceCents), porMes: true };
}

/**
 * Como o plano é cobrado, em uma linha. Sai do limite que o plano realmente usa,
 * na ordem em que eles apertam: locações em vigor, depois usuários, depois
 * anúncios publicados.
 */
export function limiteDoPlano(plano: PublicPlan): string {
  if (plano.maxActiveLeases !== null) {
    return `Até ${String(plano.maxActiveLeases)} contratos de locação ativos`;
  }
  if (plano.maxUsers !== null) {
    return `Até ${String(plano.maxUsers)} usuários`;
  }
  if (plano.maxPublishedListings !== null) {
    return `Até ${String(plano.maxPublishedListings)} anúncios publicados`;
  }
  return 'Sem limite de uso';
}
