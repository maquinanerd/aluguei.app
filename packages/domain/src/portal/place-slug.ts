/**
 * Slug de lugar para as URLs do portal (`/alugar/goiania-go/setor-bueno`).
 *
 * O endereço é digitado por gente, com acento, caixa alta e espaço duplo. O slug
 * é a chave estável que entra na URL e no índice do banco, então o cálculo
 * precisa ser determinístico e igual no servidor e na migração que preenche as
 * linhas antigas.
 */

const ACENTOS = /[̀-ͯ]/g;

export function slugifyPlace(value: string): string {
  return value
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Cidade sempre com a UF: "Goiânia"/"GO" → `goiania-go`. Cidade homônima em
 * estados diferentes existe (São Paulo tem Santana; o Amapá também).
 */
export function citySlug(city: string, state: string): string | null {
  const cidade = slugifyPlace(city);
  const uf = slugifyPlace(state);
  if (cidade === '' || uf.length !== 2) {
    return null;
  }
  return `${cidade}-${uf}`;
}

export interface CityFromSlug {
  city: string;
  state: string;
}

/** Desfaz o slug da cidade: `goiania-go` → `{ city: 'goiania', state: 'go' }`. */
export function parseCitySlug(slug: string): CityFromSlug | null {
  const partes = slug.split('-');
  const uf = partes.at(-1);
  if (partes.length < 2 || uf === undefined || uf.length !== 2) {
    return null;
  }
  const city = partes.slice(0, -1).join('-');
  if (city === '') {
    return null;
  }
  return { city, state: uf };
}
