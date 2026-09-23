/**
 * Tipos de imóvel do portal, com a cor de cada um (tokens `--tipo-*` da entrega de
 * design). A cor nunca é o único indicador: acompanha sempre o nome do tipo.
 *
 * O domínio hoje só tem APARTMENT, HOUSE, COMMERCIAL e LAND
 * (`packages/contracts/src/property.ts`); ampliar o vocabulário é trabalho da
 * Onda 2A, e por isso este módulo ainda não importa o contrato.
 */
export const TIPOS_IMOVEL = [
  'apartamento',
  'casa',
  'casa-condominio',
  'sobrado',
  'kitnet-studio',
  'cobertura',
  'sala-loja',
] as const;

export type TipoImovel = (typeof TIPOS_IMOVEL)[number];

interface TipoInfo {
  /** Nome no singular, como aparece no card e na faixa. */
  nome: string;
  /** Plural, para contagem ("48 apartamentos para alugar"). */
  plural: string;
  /** Token da cor cheia do tipo. */
  cor: string;
  /** Token da cor do texto sobre a cor cheia. */
  corTexto: string;
}

export const TIPO_IMOVEL: Record<TipoImovel, TipoInfo> = {
  apartamento: {
    nome: 'Apartamento',
    plural: 'apartamentos',
    cor: 'var(--tipo-apartamento)',
    corTexto: 'var(--tipo-apartamento-on)',
  },
  casa: {
    nome: 'Casa',
    plural: 'casas',
    cor: 'var(--tipo-casa)',
    corTexto: 'var(--tipo-casa-on)',
  },
  'casa-condominio': {
    nome: 'Casa de condomínio',
    plural: 'casas de condomínio',
    cor: 'var(--tipo-casa-condominio)',
    corTexto: 'var(--tipo-casa-condominio-on)',
  },
  sobrado: {
    nome: 'Sobrado',
    plural: 'sobrados',
    cor: 'var(--tipo-sobrado)',
    corTexto: 'var(--tipo-sobrado-on)',
  },
  'kitnet-studio': {
    nome: 'Kitnet/studio',
    plural: 'kitnets e studios',
    cor: 'var(--tipo-kitnet-studio)',
    corTexto: 'var(--tipo-kitnet-studio-on)',
  },
  cobertura: {
    nome: 'Cobertura',
    plural: 'coberturas',
    cor: 'var(--tipo-cobertura)',
    corTexto: 'var(--tipo-cobertura-on)',
  },
  'sala-loja': {
    nome: 'Sala/loja',
    plural: 'salas e lojas',
    cor: 'var(--tipo-sala-loja)',
    corTexto: 'var(--tipo-sala-loja-on)',
  },
};

export function isTipoImovel(value: string): value is TipoImovel {
  return (TIPOS_IMOVEL as readonly string[]).includes(value);
}
