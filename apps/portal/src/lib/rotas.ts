import { TIPOS_IMOVEL, isTipoImovel } from './tipos';
import type { TipoImovel } from './tipos';

/**
 * As URLs de busca do portal (ADR-099):
 *
 * ```
 * /alugar/[cidade-uf]
 * /alugar/[cidade-uf]/[tipo]
 * /alugar/[cidade-uf]/[bairro]
 * /alugar/[cidade-uf]/[bairro]/[tipo]
 * /alugar/[cidade-uf]/[bairro]/[tipo]/[n]-quartos
 * ```
 *
 * A ordem é fixa; o único salto é cidade → tipo. A leitura é determinística
 * porque o vocabulário de tipos é fechado: o segmento que casa com um tipo é
 * tipo, o que não casa é bairro.
 */

export type Finalidade = 'alugar' | 'comprar';

export const PURPOSE_DE: Record<Finalidade, 'RENT' | 'SALE'> = {
  alugar: 'RENT',
  comprar: 'SALE',
};

/** Tipo do portal → tipo do domínio (o contrato da API usa maiúsculas). */
export const TIPO_NO_DOMINIO: Record<TipoImovel, string> = {
  apartamento: 'APARTMENT',
  casa: 'HOUSE',
  'casa-condominio': 'HOUSE_CONDO',
  sobrado: 'TOWNHOUSE',
  'kitnet-studio': 'STUDIO',
  cobertura: 'PENTHOUSE',
  'sala-loja': 'COMMERCIAL',
};

/** Tipo do domínio → tipo do portal. `LAND` ainda não tem página própria. */
export function tipoDoDominio(valor: string): TipoImovel | null {
  const achado = TIPOS_IMOVEL.find((tipo) => TIPO_NO_DOMINIO[tipo] === valor);
  return achado ?? null;
}

export interface RecorteDeBusca {
  finalidade: Finalidade;
  cidade: string;
  bairro: string | null;
  tipo: TipoImovel | null;
  quartos: number | null;
}

const QUARTOS = /^([1-6])-quartos$/;
const SLUG = /^[a-z0-9-]+$/;

/**
 * Lê os segmentos da URL. Devolve nulo para caminho fora do padrão — a página
 * responde 404 em vez de inventar um recorte que ninguém pediu.
 */
export function lerRecorte(finalidade: Finalidade, segmentos: string[]): RecorteDeBusca | null {
  const [cidade, ...resto] = segmentos;
  if (cidade === undefined || !SLUG.test(cidade) || resto.length > 3) {
    return null;
  }

  let bairro: string | null = null;
  let tipo: TipoImovel | null = null;
  let quartos: number | null = null;

  for (const [indice, segmento] of resto.entries()) {
    if (!SLUG.test(segmento)) {
      return null;
    }
    const comQuartos = QUARTOS.exec(segmento);
    if (comQuartos) {
      // Quartos só no fim, e só depois de tipo (o design não tem bairro + quartos sem tipo).
      if (quartos !== null || tipo === null || indice !== resto.length - 1) {
        return null;
      }
      quartos = Number(comQuartos[1]);
      continue;
    }
    if (isTipoImovel(segmento)) {
      if (tipo !== null) {
        return null;
      }
      tipo = segmento;
      continue;
    }
    // Não é tipo nem quartos: só pode ser bairro, e só no primeiro lugar.
    if (bairro !== null || tipo !== null || indice !== 0) {
      return null;
    }
    bairro = segmento;
  }

  return { finalidade, cidade, bairro, tipo, quartos };
}

/** Monta o caminho canônico de um recorte — é o que vai na canônica e no link. */
export function caminhoDoRecorte(recorte: RecorteDeBusca): string {
  const partes = [recorte.finalidade, recorte.cidade];
  if (recorte.bairro !== null) {
    partes.push(recorte.bairro);
  }
  if (recorte.tipo !== null) {
    partes.push(recorte.tipo);
  }
  if (recorte.quartos !== null) {
    partes.push(`${String(recorte.quartos)}-quartos`);
  }
  return `/${partes.join('/')}`;
}

/** O recorte usa modificador? Muda o limiar de indexação (ADR-099). */
export function temModificador(recorte: RecorteDeBusca): boolean {
  return recorte.quartos !== null;
}

export function caminhoDoAnuncio(slug: string): string {
  return `/imovel/${slug}`;
}

export function caminhoDaVitrine(slug: string): string {
  return `/imobiliaria/${slug}`;
}

/** "Goiânia, GO" a partir do slug da cidade, quando a API ainda não respondeu. */
export function cidadeLegivel(cidadeSlug: string): string {
  const partes = cidadeSlug.split('-');
  const uf = partes.at(-1);
  const nome = partes
    .slice(0, -1)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
  return uf === undefined ? nome : `${nome}, ${uf.toUpperCase()}`;
}

/** "Setor Bueno" a partir de `setor-bueno`. */
export function lugarLegivel(slug: string): string {
  return slug
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}
