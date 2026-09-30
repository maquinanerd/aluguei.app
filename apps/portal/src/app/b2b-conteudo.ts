import type { CanalParceiro, PassoDoFluxo, PerguntaFrequente } from '@/components/b2b';

/**
 * Texto das telas B2B, num arquivo só (Onda 3).
 *
 * Fica separado das páginas por dois motivos: é o conteúdo que o dono do produto
 * revisa, e é o que precisa bater com o que o sistema faz de verdade. Nada aqui
 * promete recurso desligado sem dizer "em breve" — assinatura e cobrança real
 * estão implementadas e não ligadas (`docs/BLOCKERS.md`). Canal Pro, OLX e
 * Imovelweb não têm adapter: aparecem "Em preparação" (ADR-097, ADR-105), e
 * WhatsApp segue sem verificação ao vivo, com o selo.
 */

export const CANAIS: CanalParceiro[] = [
  {
    nome: 'AchouImóvel',
    status: 'Canal nativo',
    descricao: 'Portal próprio, com página de bairro, alerta de imóvel e lead direto no CRM.',
  },
  {
    nome: 'Canal Pro',
    status: 'Em preparação',
    descricao: 'Publicação no ZAP Imóveis e no VivaReal pela conta da sua imobiliária.',
  },
  {
    nome: 'OLX',
    status: 'Em preparação',
    descricao: 'Anúncios de aluguel e venda na OLX.',
  },
  {
    nome: 'Imovelweb',
    status: 'Em preparação',
    descricao: 'Publicação e retirada no Imovelweb.',
  },
];

export const BENEFICIOS_CANAIS = [
  'Publicação no AchouImóvel depois que você confirma',
  'O anúncio sai do portal quando você o arquiva',
  'Contato do portal no CRM, com o imóvel e a origem',
  'Situação de cada publicação no painel',
];

export const FLUXO: PassoDoFluxo[] = [
  {
    numero: '01',
    titulo: 'Cadastre o imóvel',
    texto: 'Fotos com legenda, valores de aluguel e de venda e proprietários com participação.',
  },
  {
    numero: '02',
    titulo: 'Publique no portal',
    texto: 'O anúncio vai para o AchouImóvel depois que você confirma.',
    emBreve: 'parceiros em preparação',
  },
  {
    numero: '03',
    titulo: 'Receba o lead',
    texto: 'O contato que chega pelo portal cai no CRM com o imóvel, a origem e o responsável.',
  },
  {
    numero: '04',
    titulo: 'Atenda no WhatsApp',
    texto: 'O atendimento automático responde primeiro e passa a conversa para a equipe.',
    emBreve: 'WhatsApp em breve',
  },
  {
    numero: '05',
    titulo: 'Contrato e vistoria',
    texto: 'Análise cadastral, contrato por modelo, assinatura e vistoria no celular.',
    emBreve: 'assinatura em breve',
  },
  {
    numero: '06',
    titulo: 'Cobrança e repasse',
    texto: 'Cobranças com multa e juros, divisão do valor e repasse ao proprietário.',
    emBreve: 'cobrança real em breve',
  },
];

/**
 * FAQ dos planos. As respostas descrevem o comportamento real do sistema: plano
 * não apaga dado (ADR-060), módulo fora do plano fica com cadeado (ADR-095) e o
 * cadastro nasce em análise.
 */
export const FAQ_PLANOS: PerguntaFrequente[] = [
  {
    pergunta: 'O que está incluído no plano Anunciante?',
    resposta:
      'Publicação dos seus imóveis no portal AchouImóvel e a caixa de leads com o contato de quem se interessou, o imóvel e a origem. A publicação no Canal Pro, na OLX e no Imovelweb está em preparação. O sistema de gestão (CRM, locação, financeiro) não entra nesse plano: ele aparece com cadeado e você pode contratar quando quiser.',
  },
  {
    pergunta: 'Posso anunciar sem usar o sistema?',
    resposta:
      'Pode. É exatamente o plano Anunciante: você continua no sistema que já usa, publica no AchouImóvel e recebe os contatos aqui.',
  },
  {
    pergunta: 'O que acontece com meus dados se eu mudar de plano?',
    resposta:
      'Nada é apagado. Trocar de plano muda o que fica disponível: os módulos fora do plano continuam visíveis, com cadeado, e voltam a abrir se você contratar de novo. Imóveis, contratos, leads e histórico permanecem.',
  },
  {
    pergunta: 'Quanto tempo leva para começar a usar?',
    resposta:
      'O cadastro é imediato e a conta nasce em análise: a gente confere os dados da imobiliária e o CRECI antes de liberar o painel. Enquanto a conta está em análise, o painel fica fechado; ele abre assim que a conta é aprovada.',
  },
  {
    pergunta: 'Quanto custa um sistema para imobiliária de locação?',
    resposta:
      'No AchouImóvel Gestão Locação o valor depende de quantos contratos de locação ativos você administra. Fale com a gente para receber a proposta do seu tamanho de carteira.',
  },
];
