/**
 * Endereço do painel (AchouImóvel Gestão) visto do portal.
 *
 * O portal e o painel são hosts diferentes de propósito (ADR-100), então todo
 * botão de conversão do B2B sai daqui. O endereço chega pelo ambiente — e,
 * porque estas páginas são geradas no build, também pelo `ARG APP_BASE_URL` do
 * Dockerfile. Valor vazio ou inválido cai no padrão em vez de derrubar a página,
 * pela mesma razão que `baseUrl()` em `seo.ts`.
 */

const PADRAO = 'http://localhost:3000';

export function appBaseUrl(): string {
  const configurado = process.env.APP_BASE_URL;
  if (configurado === undefined || configurado.trim() === '') {
    return PADRAO;
  }
  try {
    return new URL(configurado).toString().replace(/\/$/, '');
  } catch {
    return PADRAO;
  }
}

/**
 * Cadastro no painel. O código do plano viaja no `?plano=`, que é o que o
 * cadastro em etapas lê para já vir com o plano escolhido — por isso o código do
 * plano é público no contrato (`publicPlanSchema`).
 */
export function urlCadastro(codigoDoPlano?: string | null): string {
  const base = `${appBaseUrl()}/register`;
  if (codigoDoPlano === undefined || codigoDoPlano === null || codigoDoPlano === '') {
    return base;
  }
  return `${base}?plano=${encodeURIComponent(codigoDoPlano)}`;
}

export function urlEntrar(): string {
  return `${appBaseUrl()}/login`;
}
