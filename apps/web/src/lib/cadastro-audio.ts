/**
 * Cadastro de imóvel por áudio (ADR-104) — o que a tela de revisão precisa saber.
 *
 * Fica fora do componente porque é a parte que dá para testar sem navegador: o
 * rótulo de cada campo, o grupo a que ele pertence, como o valor guardado vira
 * texto legível e quanto do cadastro já está confirmado.
 */

export type EstadoDoCampo = 'FROM_AUDIO' | 'NEEDS_CONFIRMATION' | 'MISSING' | 'EDITED';

export type ChaveDoCampo =
  | 'TITLE'
  | 'PROPERTY_TYPE'
  | 'PURPOSE'
  | 'TOTAL_AREA_SQM'
  | 'BEDROOMS'
  | 'BATHROOMS'
  | 'PARKING_SPOTS'
  | 'FURNISHED'
  | 'PETS_ALLOWED'
  | 'MONTHLY_RENT_CENTS'
  | 'SALE_PRICE_CENTS'
  | 'CONDO_FEE_CENTS'
  | 'IPTU_CENTS'
  | 'STREET'
  | 'NUMBER'
  | 'COMPLEMENT'
  | 'NEIGHBORHOOD'
  | 'CITY'
  | 'STATE'
  | 'ZIP_CODE';

export interface CampoDoRascunho {
  key: ChaveDoCampo;
  value: string | null;
  state: EstadoDoCampo;
  evidence: string | null;
}

export interface RascunhoDeAudio {
  id: string;
  status: 'CAPTURING' | 'PROCESSING' | 'REVIEW' | 'CONFIRMED' | 'DISCARDED' | 'FAILED';
  transcript: string | null;
  audioKey: string | null;
  audioSeconds: number | null;
  failureReason: string | null;
  propertyId: string | null;
  fields: CampoDoRascunho[];
  createdAt: string;
  updatedAt: string;
}

export const ROTULO_DO_CAMPO: Record<ChaveDoCampo, string> = {
  TITLE: 'Título do anúncio',
  PROPERTY_TYPE: 'Tipo',
  PURPOSE: 'Finalidade',
  TOTAL_AREA_SQM: 'Área',
  BEDROOMS: 'Quartos',
  BATHROOMS: 'Banheiros',
  PARKING_SPOTS: 'Vagas',
  FURNISHED: 'Mobiliado',
  PETS_ALLOWED: 'Aceita pet',
  MONTHLY_RENT_CENTS: 'Aluguel',
  SALE_PRICE_CENTS: 'Preço de venda',
  CONDO_FEE_CENTS: 'Condomínio',
  IPTU_CENTS: 'IPTU',
  STREET: 'Rua',
  NUMBER: 'Número',
  COMPLEMENT: 'Complemento',
  NEIGHBORHOOD: 'Bairro',
  CITY: 'Cidade',
  STATE: 'UF',
  ZIP_CODE: 'CEP',
};

/** Ordem e agrupamento da revisão — é como a pessoa lê, não como o banco guarda. */
export const GRUPOS: Array<{ titulo: string; campos: ChaveDoCampo[] }> = [
  { titulo: 'Identificação', campos: ['TITLE', 'PROPERTY_TYPE', 'PURPOSE'] },
  {
    titulo: 'Endereço',
    campos: ['STREET', 'NUMBER', 'COMPLEMENT', 'NEIGHBORHOOD', 'CITY', 'STATE', 'ZIP_CODE'],
  },
  {
    titulo: 'Características',
    campos: [
      'BEDROOMS',
      'BATHROOMS',
      'PARKING_SPOTS',
      'TOTAL_AREA_SQM',
      'FURNISHED',
      'PETS_ALLOWED',
    ],
  },
  {
    titulo: 'Valores',
    campos: ['MONTHLY_RENT_CENTS', 'SALE_PRICE_CENTS', 'CONDO_FEE_CENTS', 'IPTU_CENTS'],
  },
];

export const ESTADO_ROTULO: Record<EstadoDoCampo, string> = {
  FROM_AUDIO: 'Do áudio',
  NEEDS_CONFIRMATION: 'Confirmar',
  MISSING: 'Faltando',
  EDITED: 'Editado',
};

export const ESTADO_TOM: Record<EstadoDoCampo, 'success' | 'warning' | 'danger' | 'neutral'> = {
  FROM_AUDIO: 'success',
  NEEDS_CONFIRMATION: 'warning',
  MISSING: 'danger',
  EDITED: 'neutral',
};

const CENTAVOS: ChaveDoCampo[] = [
  'MONTHLY_RENT_CENTS',
  'SALE_PRICE_CENTS',
  'CONDO_FEE_CENTS',
  'IPTU_CENTS',
];

const BOOLEANOS: ChaveDoCampo[] = ['FURNISHED', 'PETS_ALLOWED'];

const TIPO_ROTULO: Record<string, string> = {
  APARTMENT: 'Apartamento',
  HOUSE: 'Casa',
  STUDIO: 'Kitnet/Studio',
  COMMERCIAL: 'Comercial',
  LAND: 'Terreno',
};

const FINALIDADE_ROTULO: Record<string, string> = {
  RENT: 'Aluguel',
  SALE: 'Venda',
  BOTH: 'Aluguel e venda',
};

/** Como o valor guardado aparece na tela. Vazio vira travessão, nunca "R$ 0,00". */
export function valorLegivel(campo: CampoDoRascunho): string {
  const valor = campo.value;
  if (valor === null || valor.trim() === '') {
    return '—';
  }
  if (CENTAVOS.includes(campo.key)) {
    const centavos = Number(valor);
    if (!Number.isFinite(centavos)) {
      return valor;
    }
    return (centavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }
  if (BOOLEANOS.includes(campo.key)) {
    return valor === 'true' ? 'Sim' : 'Não';
  }
  if (campo.key === 'PROPERTY_TYPE') {
    return TIPO_ROTULO[valor] ?? valor;
  }
  if (campo.key === 'PURPOSE') {
    return FINALIDADE_ROTULO[valor] ?? valor;
  }
  if (campo.key === 'TOTAL_AREA_SQM') {
    return `${valor} m²`;
  }
  return valor;
}

/** O que a pessoa digita ao editar; dinheiro é editado em reais, não em centavos. */
export function valorParaEdicao(campo: CampoDoRascunho): string {
  const valor = campo.value;
  if (valor === null) {
    return '';
  }
  if (CENTAVOS.includes(campo.key)) {
    const centavos = Number(valor);
    return Number.isFinite(centavos) ? String(centavos / 100) : valor;
  }
  return valor;
}

/** O caminho de volta: o que foi digitado vira o que a API guarda. */
export function valorParaApi(chave: ChaveDoCampo, digitado: string): string | null {
  const texto = digitado.trim();
  if (texto === '') {
    return null;
  }
  if (CENTAVOS.includes(chave)) {
    const reais = Number(texto.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(reais) || reais < 0) {
      return null;
    }
    return String(Math.round(reais * 100));
  }
  return texto;
}

export interface Progresso {
  confirmados: number;
  total: number;
  faltando: number;
  aConfirmar: number;
}

/**
 * Quanto do cadastro está resolvido. "Confirmado" é o que veio limpo do áudio
 * ou o que a pessoa escreveu — o que está pendente de confirmação **não** conta,
 * senão a barra diria que está pronto quando não está.
 */
export function progressoDaRevisao(campos: CampoDoRascunho[]): Progresso {
  const confirmados = campos.filter(
    (campo) => campo.state === 'FROM_AUDIO' || campo.state === 'EDITED',
  ).length;
  return {
    confirmados,
    total: campos.length,
    faltando: campos.filter((campo) => campo.state === 'MISSING').length,
    aConfirmar: campos.filter((campo) => campo.state === 'NEEDS_CONFIRMATION').length,
  };
}

/** Sem estes dois a confirmação recusa; a tela avisa antes de a pessoa tentar. */
export function faltaParaConfirmar(campos: CampoDoRascunho[]): ChaveDoCampo[] {
  const obrigatorios: ChaveDoCampo[] = ['TITLE', 'PROPERTY_TYPE'];
  return obrigatorios.filter((chave) => {
    const campo = campos.find((c) => c.key === chave);
    return campo === undefined || campo.value === null || campo.value.trim() === '';
  });
}

/** `188` → `3min 08s`; a tela mostra a duração do que foi gravado. */
export function duracaoLegivel(segundos: number | null): string | null {
  if (segundos === null || segundos < 0) {
    return null;
  }
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos)}min ${String(resto).padStart(2, '0')}s`;
}
