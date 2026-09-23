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
