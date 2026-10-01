/**
 * Endereço do portal (achouimovel.online) visto do painel, para "Comparar planos" na tela de
 * upgrade. O portal e o painel são hosts diferentes (ADR-100); o endereço vem do ambiente, lido no
 * servidor (o layout do painel é dinâmico). Valor vazio ou inválido cai no do desenvolvimento local.
 */

const PADRAO = 'http://localhost:3100';

export function portalBaseUrl(): string {
  const configurado = process.env.PORTAL_BASE_URL;
  if (configurado === undefined || configurado.trim() === '') {
    return PADRAO;
  }
  try {
    return new URL(configurado).toString().replace(/\/$/, '');
  } catch {
    return PADRAO;
  }
}
