import type { ImovelResumo } from '@/components';
import type { TipoImovel } from '@/lib/tipos';

/**
 * Conteúdo da tela 01 (`design-source/achouimovel/telas/portal/00-identidade.dc.html`), copiado do
 * `renderVals()` da tela. Os valores das tabelas de cor, tipo, raio e breakpoints são conferidos
 * contra `src/styles/tokens.css` em `identidade.test.ts`: a página mostra o que o CSS aplica.
 */

export interface Referencia {
  nome: string;
  arquivo: string;
  usar: string;
  evitar: string;
  motivo: string;
}

export const REFERENCIAS: Referencia[] = [
  {
    nome: 'OpaPreço (pacote de front-end)',
    arquivo: 'front_opapreco/',
    usar: 'Base visual inteira: branco, divisórias de 1px, Guton sem caixa alta, uma cor de acento, cor por categoria em quadrado/filete/bloco, FiltrosLaterais em gaveta no celular, ChipsFiltro, FAQ com FAQPage, barra fixa com preço e botão no celular. Painel no estilo Vibe com pílulas de status.',
    evitar:
      'Foto em contain com multiply sobre fundo quente, SlideDestaque em carrossel, ProvaSocial com números e nota do Google, malha de fundo.',
    motivo:
      'Foto de imóvel é ambiente e precisa preencher o quadro. Número de prova social sem fonte real quebra a regra "todo dado vem do anúncio".',
  },
  {
    nome: 'QuintoAndar · home',
    arquivo: '3541157e…pdf',
    usar: 'Busca no hero com abas Alugar/Comprar, cidade, bairro, "valor total até" e quartos. Colunas por cidade com links por tipo. "Buscas mais populares".',
    evitar:
      'Blocos de serviço ilustrados em cores fortes, banner de consórcio, carrosséis de promoção.',
    motivo:
      'Valor total como filtro é exatamente o nosso dado. Serviços financeiros não existem no AchouImóvel.',
  },
  {
    nome: 'ZAP Imóveis · home',
    arquivo: 'ada78e0d…pdf',
    usar: 'Card com aluguel e a linha "Cond. · IPTU" logo abaixo, atributos em linha. Lista de bairros populares por cidade.',
    evitar: 'Espaços de publicidade, botão "Contatar" em cada card, blog, roxo em todos os botões.',
    motivo:
      'O botão no card compete com o clique do card inteiro. Blog e notícias estão fora de escopo.',
  },
  {
    nome: 'VivaReal · home',
    arquivo: 'b2ff0f6c…png',
    usar: 'Faixa "Corretores, imobiliárias e incorporadoras" como modelo da nossa "Para imobiliárias". Bloco de cidades com foto e cinco links.',
    evitar:
      'Recortes orgânicos em fotos, foto de banco com pessoas, card cortado na borda do carrossel, rodapé escuro.',
    motivo:
      'Proibido fundo escuro. Foto de pessoa não é dado de anúncio e ocupa o lugar do imóvel.',
  },
  {
    nome: 'MySide · home',
    arquivo: 'a3dce984…pdf',
    usar: 'Hubs por cidade com lista de bairros (base do SEO por bairro). Organização de conteúdo por etapa da procura.',
    evitar:
      'Faixa azul-escura com busca, depoimentos com estrelas, vitrine de lançamentos, calculadoras.',
    motivo: 'Lançamentos, calculadoras e guias estão fora do PR A e do PR B.',
  },
  {
    nome: 'Kenlo · home',
    arquivo: 'd315eba7…pdf',
    usar: 'Ecossistema apresentado produto a produto com uma frase cada. Lista "como uma imobiliária opera" em passos. FAQ em frase direta.',
    evitar:
      'Seções escuras, cartões pastel com formas, números grandes, palavras coloridas no meio do título.',
    motivo: 'Nenhum fundo escuro. Usar como referência de conteúdo e estrutura, não de visual.',
  },
  {
    nome: 'Kenlo Imob · CRM',
    arquivo: 'cmr kenlo.pdf',
    usar: 'Roteiro da página B2B: problema → fluxo do lead ao fechamento → módulos → planos com preço público → FAQ longo. Três planos lado a lado com a mesma lista de itens.',
    evitar: 'Chamada escura no meio da página, carrossel de depoimentos com números.',
    motivo: 'É o molde de /para-imobiliarias/gestao e de /planos.',
  },
  {
    nome: 'Kenlo Locação · ERP',
    arquivo: 'erp.pdf',
    usar: 'Como apresenta cobrança, repasse e conciliação. Plano cobrado por contratos administrados, que é o modelo do Gestão Locação.',
    evitar: 'DIMOB e NF-e como recurso pronto, bloco final e rodapé escuros.',
    motivo:
      'Não temos DIMOB nem NF-e. Cobrança real aparece como "em breve" enquanto não estiver no ar.',
  },
  {
    nome: 'LYA SDR (2 arquivos iguais)',
    arquivo: '4becd22b… / f29d7e6c…pdf',
    usar: 'Fluxo em passos do primeiro atendimento até o lead qualificado e a passagem para o corretor.',
    evitar: '"A IA atende e agenda sozinha" como promessa.',
    motivo: 'No AchouImóvel o atendimento automático passa para a equipe e a pessoa decide.',
  },
  {
    nome: 'LYA Omnichannel',
    arquivo: 'cd80519d…pdf',
    usar: 'Caixa de entrada em três colunas: lista, conversa, contexto do lead. Quem está respondendo sempre visível. Tabela antes × depois.',
    evitar: 'Tabela comparativa em fundo escuro.',
    motivo: 'É o modelo direto da tela Atendimento.',
  },
  {
    nome: 'LYA Editor',
    arquivo: 'ca94be27…pdf',
    usar: 'Fluxo sugerir → revisar → aprovar e a fila de anúncios que precisam de melhoria.',
    evitar: 'Geração em massa sem revisão.',
    motivo:
      'Regra 1: toda sugestão de IA tem estado "sugerido" e ações aceitar, editar e descartar.',
  },
  {
    nome: 'LYA Studio',
    arquivo: 'b945b9e4…pdf',
    usar: 'Galeria com legenda por foto e ações por imagem.',
    evitar: 'Ambientação virtual de fotos publicada no portal.',
    motivo: 'Mostraria um imóvel diferente do real para quem procura. Fora de escopo.',
  },
  {
    nome: 'Kenlo · cadastro',
    arquivo: '77dde5e0…pdf',
    usar: 'Uma pergunta por tela, contador "1 de 6", botão largo "Próximo".',
    evitar: 'Metade da tela com oferta de preço, selo "só este mês" e botão em gradiente.',
    motivo: 'Modelo do /register com plano escolhido, sem gradiente nem urgência.',
  },
];

export interface TokenDeCor {
  nome: string;
  valor: string;
  uso: string;
}

export const TOKENS_DE_COR: TokenDeCor[] = [
  {
    nome: '--brand-accent',
    valor: '#037A4B',
    uso: 'Valor (total ou preço), botão principal, links de texto',
  },
  { nome: '--brand-accent-hover', valor: '#02603B', uso: 'Hover e pressionado do botão principal' },
  { nome: '--portal-bg', valor: '#FFFFFF', uso: 'Fundo de todas as páginas' },
  { nome: '--portal-surface', valor: '#F4F4F2', uso: 'Faixas e espaço da foto enquanto carrega' },
  { nome: '--portal-ink', valor: '#111111', uso: 'Títulos, filete de título de seção' },
  { nome: '--portal-ink-2', valor: '#333333', uso: 'Texto corrido' },
  { nome: '--portal-muted', valor: '#555555', uso: 'Subtítulos, linha de valores separados' },
  { nome: '--portal-muted-2', valor: '#6E6E6E', uso: 'Rótulos pequenos, CRECI, trilha (5,1:1)' },
  { nome: '--portal-line', valor: '#E6E6E3', uso: 'Divisória de seção' },
  { nome: '--portal-line-soft', valor: '#EFEFEC', uso: 'Divisória de linha de lista' },
  { nome: '--portal-focus', valor: '#037A4B', uso: 'Anel de foco 2px, afastado 2px' },
  { nome: '--portal-error', valor: '#B42318', uso: 'Erro de formulário (texto e borda)' },
];

export interface TokenDeTipo {
  nome: string;
  tamanho: string;
  peso: string;
  tracking: string;
  uso: string;
}

export const ESCALA_DE_TIPO: TokenDeTipo[] = [
  {
    nome: '--type-h1-home',
    tamanho: 'clamp(30px,4.2vw,52px)/1.1',
    peso: '700',
    tracking: '-0.03em',
    uso: 'H1 da home, text-wrap: balance',
  },
  {
    nome: '--type-h1',
    tamanho: 'clamp(28px,4vw,46px)/1.08',
    peso: '800',
    tracking: '-0.035em',
    uso: 'H1 da busca ("48 apartamentos para alugar…") e do anúncio',
  },
  {
    nome: '--type-h2',
    tamanho: 'clamp(20px,2.3vw,26px)/1.1',
    peso: '700',
    tracking: '-0.02em',
    uso: 'Título de seção com filete de 1px abaixo',
  },
  {
    nome: '--type-price-xl',
    tamanho: 'clamp(34px,4.4vw,52px)/1',
    peso: '800',
    tracking: '-0.035em',
    uso: 'Total mensal ou preço na página do anúncio',
  },
  {
    nome: '--type-price-card',
    tamanho: '18–20px/1.2',
    peso: '800',
    tracking: '-0.025em',
    uso: 'Valor no ImovelCard',
  },
  {
    nome: '--type-card-title',
    tamanho: '14–15px/1.35',
    peso: '600',
    tracking: '-0.015em',
    uso: 'Tipo, bairro e atributos no card',
  },
  {
    nome: '--type-body',
    tamanho: '15–16.5px/1.7',
    peso: '400',
    tracking: '0',
    uso: 'Descrição do anúncio, texto de SEO, FAQ',
  },
  {
    nome: '--type-label',
    tamanho: '11.5–12px/1.4',
    peso: '600',
    tracking: '0',
    uso: 'Rótulos, CRECI, trilha',
  },
];

export interface ParNomeValor {
  nome: string;
  valor: string;
}

/**
 * Espaçamento. As três linhas de quadro e respiro mostram o valor que o CSS aplica, que segue os
 * artboards (ADR-105, T1) e não a tabela da identidade: 1280/36px e 56–104px na tabela; 1440/64px e
 * 48–88px nas telas.
 */
export const ESPACAMENTO: ParNomeValor[] = [
  { nome: '--space-1 … --space-6', valor: '4 · 8 · 12 · 16 · 24 · 32 px' },
  { nome: '--space-7 · --space-8', valor: '48 · 64 px' },
  { nome: '--portal-section-gap', valor: '48 · 72 (900) · 88 (1280) px' },
  { nome: '--portal-gutter', valor: '18 · 48 (900) · 64 (1280) px' },
  { nome: '--portal-max', valor: '1440px (cabeçalho 1440px)' },
  { nome: '--tap-min', valor: '44px em qualquer alvo de toque' },
];

export const RAIO: ParNomeValor[] = [
  { nome: '--portal-radius-structure', valor: '0' },
  { nome: '--portal-radius', valor: '4px · foto, card, botão, campo' },
  { nome: '--radius-avatar', valor: '50%' },
];

export const BREAKPOINTS: ParNomeValor[] = [
  {
    nome: '390',
    valor: 'Celular de referência. Menu e filtros em gaveta, barra fixa de contato',
  },
  { nome: '640', valor: 'Grade de cards em 2 colunas' },
  { nome: '900', valor: 'Cabeçalho completo (64px) e filtros laterais fixos' },
  { nome: '1180', valor: 'Grade em 3–4 colunas, mosaico de tipos numa fileira' },
  { nome: '1440', valor: 'Desktop de referência das telas' },
];

export interface AmostraDeTipo {
  tipo: TipoImovel;
  fundo: string;
  texto: string;
  exemplo: string;
  contraste: string;
}

export const TIPOS: AmostraDeTipo[] = [
  {
    tipo: 'apartamento',
    fundo: '#0B4A7E',
    texto: '#FFFFFF',
    exemplo: '312 anúncios',
    contraste: 'Texto branco 9,2:1',
  },
  {
    tipo: 'casa',
    fundo: '#FF6A2A',
    texto: '#1F0A00',
    exemplo: '148 anúncios',
    contraste: 'Texto escuro 6,8:1 (branco não passa)',
  },
  {
    tipo: 'casa-condominio',
    fundo: '#037A4B',
    texto: '#FFFFFF',
    exemplo: '64 anúncios',
    contraste: 'Texto branco 5,4:1',
  },
  {
    tipo: 'sobrado',
    fundo: '#4A0A4E',
    texto: '#FFFFFF',
    exemplo: '37 anúncios',
    contraste: 'Texto branco 14,6:1',
  },
  {
    tipo: 'kitnet-studio',
    fundo: '#D42A2A',
    texto: '#FFFFFF',
    exemplo: '91 anúncios',
    contraste: 'Texto branco 5,0:1',
  },
  {
    tipo: 'cobertura',
    fundo: '#0B3A12',
    texto: '#FFFFFF',
    exemplo: '22 anúncios',
    contraste: 'Texto branco 13,1:1',
  },
  {
    tipo: 'sala-loja',
    fundo: '#B5B5B5',
    texto: '#111111',
    exemplo: '45 anúncios',
    contraste: 'Texto escuro 9,4:1',
  },
];

/** Os três cards de amostra (`cards` do `renderVals()`), em centavos, com a imobiliária fictícia. */
const ANUNCIANTE = { nome: 'Imobiliária Exemplo', creci: '0000-J' };

export const CARD_ALUGUEL: ImovelResumo = {
  slug: 'amostra-apartamento-setor-bueno',
  tipo: 'apartamento',
  finalidade: 'aluguel',
  bairro: 'Setor Bueno',
  cidade: 'Goiânia',
  uf: 'GO',
  aluguelCents: 230_000,
  condominioCents: 48_000,
  iptuCents: 13_000,
  totalMensalCents: 291_000,
  areaM2: 72,
  quartos: 2,
  suites: 1,
  vagas: 1,
  fotos: 12,
  anunciante: ANUNCIANTE,
};

export const CARD_VENDA: ImovelResumo = {
  slug: 'amostra-casa-de-condominio-jardins-atenas',
  tipo: 'casa-condominio',
  finalidade: 'venda',
  bairro: 'Jardins Atenas',
  cidade: 'Goiânia',
  uf: 'GO',
  precoVendaCents: 89_000_000,
  condominioCents: 62_000,
  iptuCents: 21_000,
  areaM2: 170,
  quartos: 3,
  suites: 3,
  vagas: 2,
  fotos: 18,
  anunciante: ANUNCIANTE,
};

export const CARD_AMBOS: ImovelResumo = {
  slug: 'amostra-kitnet-setor-universitario',
  tipo: 'kitnet-studio',
  finalidade: 'ambos',
  bairro: 'Setor Universitário',
  cidade: 'Goiânia',
  uf: 'GO',
  totalMensalCents: 134_000,
  precoVendaCents: 21_000_000,
  areaM2: 32,
  quartos: 1,
  suites: 0,
  vagas: 0,
  mobiliado: true,
  aceitaPet: true,
  fotos: 9,
  anunciante: ANUNCIANTE,
};

export const CARDS_DE_AMOSTRA: ImovelResumo[] = [CARD_ALUGUEL, CARD_VENDA, CARD_AMBOS];
