/**
 * Marca do produto num lugar só (entrega de design do AchouImóvel, regra 6).
 * Antes disso, "Aluguei.app" estava escrito à mão em dezenas de arquivos.
 *
 * - `name` fala com o consumidor final: portal, área do cliente e telas de conta.
 * - `b2bName` é o lado pago, na gestão: selo "A" + "AchouImóvel Gestão".
 */
export const BRAND = {
  name: 'AchouImóvel',
  b2bName: 'AchouImóvel Gestão',
  /** Selo quadrado da sidebar, ao lado do nome. */
  seal: 'A',
} as const;

/** Sufixo do `<title>` das telas do painel e da plataforma. */
export function tituloGestao(pagina: string): string {
  return `${pagina} | ${BRAND.b2bName}`;
}

/** Sufixo do `<title>` das telas que falam com o consumidor final. */
export function tituloPortal(pagina: string): string {
  return `${pagina} | ${BRAND.name}`;
}
