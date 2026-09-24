import type { CanalParceiro, PassoDoFluxo, PerguntaFrequente } from '@/components/b2b';

/**
 * Texto das telas B2B, num arquivo só (Onda 3).
 *
 * Fica separado das páginas por dois motivos: é o conteúdo que o dono do produto
 * revisa, e é o que precisa bater com o que o sistema faz de verdade. Nada aqui
 * promete recurso desligado sem dizer "em breve" — assinatura e cobrança real
 * estão implementadas e não ligadas (`docs/BLOCKERS.md`).
 */

export const CANAIS: CanalParceiro[] = [
  {
    nome: 'AchouImóvel',
    status: 'Canal nativo',
    descricao: 'Portal próprio, com página de bairro, alerta de imóvel e lead direto no CRM.',
  },
  {
    nome: 'Canal Pro',
    status: 'Integrado',
    descricao: 'Publica no ZAP Imóveis e no VivaReal pela conta da sua imobiliária.',
  },
  {
    nome: 'OLX',
    status: 'Integrado',
    descricao: 'Anúncios de aluguel e venda na OLX, com fotos e valores sincronizados.',
  },
  {
    nome: 'Imovelweb',
    status: 'Integrado',
    descricao: 'Publicação e retirada automáticas, com os leads voltando para o CRM.',
  },
];

export const BENEFICIOS_CANAIS = [
  'Publicação e atualização automáticas em todos os canais',
  'Retirada de todos os portais quando o imóvel sai',
  'Leads de todos os portais no mesmo CRM, com a origem',
  'Status de cada publicação por canal no painel',
];

export const FLUXO: PassoDoFluxo[] = [
  {
    numero: '01',
    titulo: 'Cadastre o imóvel',
    texto: 'Fotos com legenda, valores de aluguel e de venda e proprietários com participação.',
  },
  {
    numero: '02',
    titulo: 'Publique em todos os portais',
    texto: 'AchouImóvel, Canal Pro, OLX e Imovelweb num só envio. Você confirma antes de publicar.',
  },
  {
    numero: '03',
    titulo: 'Receba o lead',
    texto: 'O contato de qualquer portal chega no CRM com o imóvel, a origem e o responsável.',
  },
  {
    numero: '04',
    titulo: 'Atenda no WhatsApp',
    texto: 'O atendimento automático responde primeiro e passa a conversa para a equipe.',
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
      'Publicação dos seus imóveis no portal AchouImóvel e nos portais parceiros, e a caixa de leads com o contato de quem se interessou, o imóvel e a origem. O sistema de gestão (CRM, locação, financeiro) não entra nesse plano: ele aparece com cadeado e você pode contratar quando quiser.',
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
      'O cadastro é imediato e a conta nasce em análise: a gente confere os dados da imobiliária e o CRECI antes de liberar a publicação. Enquanto isso você já pode cadastrar imóveis e preparar a carteira.',
  },
  {
    pergunta: 'Quanto custa um sistema para imobiliária de locação?',
    resposta:
      'No AchouImóvel Gestão Locação o valor depende de quantos contratos de locação ativos você administra. Fale com a gente para receber a proposta do seu tamanho de carteira.',
  },
];
