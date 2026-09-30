import type { PlanModule } from '@aluguei/domain';

/**
 * Vocabulário dos módulos do plano para a interface.
 *
 * O painel importa só o **tipo** de `@aluguei/domain` — o pacote é código de
 * servidor (argon2, pg) e entrar nele em tempo de execução quebra o build do
 * Next. O `Record<PlanModule, …>` garante o que importa: módulo novo no domínio
 * não compila aqui até ganhar nome e descrição, e `plan-modules.test.ts` compara
 * esta lista com a do domínio.
 */
export const NOME_DO_MODULO: Record<PlanModule, string> = {
  CRM: 'CRM',
  ATENDIMENTO: 'Atendimento',
  LOCACAO: 'Locação',
  FINANCEIRO: 'Financeiro',
  VENDAS: 'Vendas',
  MARKETING: 'Marketing',
};

/** O que cada módulo abre, em uma frase, para a tela "Fora do seu plano". */
export const O_QUE_O_MODULO_TEM: Record<PlanModule, string> = {
  CRM: 'Funil de leads, agenda, visitas e propostas.',
  ATENDIMENTO: 'Caixa de entrada do WhatsApp, com atendimento automático e passagem para a equipe.',
  LOCACAO: 'Análise cadastral, contrato, assinatura, vistoria e locação.',
  FINANCEIRO: 'Cobranças, pagamentos, repasses, conciliação e contabilidade.',
  VENDAS: 'Negociações de venda, comissão e contrato de compra e venda.',
  MARKETING: 'Campanhas de Meta Ads, sempre criadas pausadas.',
};

export const MODULOS_DO_PLANO = Object.keys(NOME_DO_MODULO) as PlanModule[];

/** Converte o que veio da URL; valor desconhecido vira nulo, nunca um módulo. */
export function moduloDe(valor: string | undefined): PlanModule | null {
  if (!valor) {
    return null;
  }
  return MODULOS_DO_PLANO.includes(valor as PlanModule) ? (valor as PlanModule) : null;
}

/**
 * O que o módulo acrescenta, para a tela de upgrade (tela 33, `01-painel.dc.html#upgrade`). Locação
 * tem a lista do desenho; os demais saem de `O_QUE_O_MODULO_TEM`, sem recurso que o produto não
 * tenha.
 */
export const UPGRADE_ITENS: Record<PlanModule, readonly string[]> = {
  CRM: ['Funil de leads', 'Agenda', 'Visitas', 'Propostas'],
  ATENDIMENTO: ['Caixa de entrada do WhatsApp', 'Atendimento automático', 'Passagem para a equipe'],
  LOCACAO: [
    'Contratos e encargos',
    'Reajuste, renovação e encerramento',
    'Vistoria de entrada e saída',
    'Cobranças com multa e juros',
    'Split e repasse ao proprietário',
    'Área do proprietário e do inquilino',
  ],
  FINANCEIRO: ['Cobranças', 'Pagamentos', 'Repasses', 'Conciliação', 'Contabilidade'],
  VENDAS: ['Negociações de venda', 'Comissão', 'Contrato de compra e venda'],
  MARKETING: ['Campanhas de Meta Ads', 'Sempre criadas pausadas'],
};

/** O que o painel passa a fazer com o módulo ("o mesmo painel passa a …"). */
export const UPGRADE_ACAO: Record<PlanModule, string> = {
  CRM: 'organizar o funil, a agenda, as visitas e as propostas',
  ATENDIMENTO: 'atender pelo WhatsApp, com passagem para a equipe',
  LOCACAO: 'administrar contratos, vistorias, cobranças e repasses',
  FINANCEIRO: 'cobrar, conciliar pagamentos e repassar ao proprietário',
  VENDAS: 'acompanhar negociações de venda, comissão e contrato',
  MARKETING: 'criar campanhas de Meta Ads, sempre pausadas',
};

/**
 * Título da tela de upgrade pelo item do menu que a pessoa abriu ("Locações estão disponíveis
 * no …"), com a concordância certa; sem item, pelo módulo.
 */
const FRASE_DO_ITEM: Record<string, string> = {
  Pipeline: 'O pipeline está disponível',
  Agenda: 'A agenda está disponível',
  Negociações: 'Negociações estão disponíveis',
  Inbox: 'O Inbox está disponível',
  Visitas: 'Visitas estão disponíveis',
  Propostas: 'Propostas estão disponíveis',
  Crédito: 'A análise de crédito está disponível',
  Contratos: 'Contratos estão disponíveis',
  Vistorias: 'Vistorias estão disponíveis',
  Locações: 'Locações estão disponíveis',
  'Visão Geral': 'O financeiro está disponível',
  Cobranças: 'Cobranças estão disponíveis',
  Pagamentos: 'Pagamentos estão disponíveis',
  Repasses: 'Repasses estão disponíveis',
  Conciliação: 'A conciliação está disponível',
  Ledger: 'O ledger está disponível',
  Marketing: 'O marketing está disponível',
};

export function fraseDeUpgrade(item: string | null, modulo: PlanModule): string {
  if (item !== null && FRASE_DO_ITEM[item] !== undefined) {
    return FRASE_DO_ITEM[item];
  }
  return `${NOME_DO_MODULO[modulo]} está disponível`;
}
