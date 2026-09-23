/**
 * Política de indexação das páginas de busca do portal (ADR-099 e
 * `docs/frontend/PORTAL_SEO.md`).
 *
 * A regra vive aqui, e não na página, porque três lugares precisam dar a mesma
 * resposta: a própria página (robots e canônica), o sitemap e o bloco de
 * estatística. Número solto em cada um deles é como o índice acaba cheio de
 * página vazia.
 */

/** Abaixo disto a página existe para a pessoa, mas não para o buscador. */
export const MIN_LISTINGS_TO_INDEX = 3;

/** Estatística (mediana, faixa) só com amostra que não mente. */
export const MIN_SAMPLE_FOR_STATS = 5;

/** Recorte com modificador (quartos, característica) exige amostra maior. */
export const MIN_LISTINGS_TO_INDEX_WITH_MODIFIER = 5;

export interface PageIndexingInput {
  /** Quantos anúncios publicados o recorte tem agora. */
  count: number;
  /** O recorte usa modificador além de cidade, bairro e tipo? */
  hasModifier?: boolean;
  /** Página 2 em diante nunca indexa. */
  page?: number;
  /** Ordenação ou filtro fino em query string nunca indexa. */
  hasQueryFilters?: boolean;
}

/** A página pode ser indexada e entrar no sitemap? */
export function isIndexablePage({
  count,
  hasModifier = false,
  page = 1,
  hasQueryFilters = false,
}: PageIndexingInput): boolean {
  if (page > 1 || hasQueryFilters) {
    return false;
  }
  const minimo = hasModifier ? MIN_LISTINGS_TO_INDEX_WITH_MODIFIER : MIN_LISTINGS_TO_INDEX;
  return count >= minimo;
}

/** Mostra mediana e faixa? Amostra pequena vira número que engana. */
export function showsPriceStats(count: number): boolean {
  return count >= MIN_SAMPLE_FOR_STATS;
}

/** Valor de `<meta name="robots">` da página. */
export function robotsFor(input: PageIndexingInput): 'index, follow' | 'noindex, follow' {
  return isIndexablePage(input) ? 'index, follow' : 'noindex, follow';
}

/**
 * Mediana em centavos de uma amostra. Devolve nulo abaixo do mínimo — é o mesmo
 * limiar do bloco de estatística, para não existir número sem amostra em lugar
 * nenhum do sistema.
 */
export function medianCents(values: readonly number[]): number | null {
  if (values.length < MIN_SAMPLE_FOR_STATS) {
    return null;
  }
  const ordenado = [...values].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  if (ordenado.length % 2 === 1) {
    return ordenado[meio] ?? null;
  }
  const anterior = ordenado[meio - 1] ?? 0;
  const posterior = ordenado[meio] ?? 0;
  return Math.round((anterior + posterior) / 2);
}
