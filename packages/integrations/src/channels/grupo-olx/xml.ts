/**
 * Escrita de XML sem biblioteca (ADR-107): o feed só **gera** XML, nunca lê — não há parser, e por
 * isso não há como habilitar entidade externa (XXE). Todo texto que vem do cadastro passa por aqui.
 */

/**
 * Caracteres que o XML 1.0 não aceita nem dentro de CDATA (controles fora de tab, LF e CR, e
 * surrogate solto). Texto colado de editor costuma trazer alguns; sem tirar, o arquivo inteiro
 * deixa de ser XML válido e o portal recusa a carga toda.
 */
const INVALID_XML_CHARS =
  // eslint-disable-next-line no-control-regex -- os controles são justamente o que o XML 1.0 proíbe
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripInvalidXmlChars(value: string): string {
  return value.replace(INVALID_XML_CHARS, '');
}

/** Texto de elemento: escapa os cinco caracteres reservados. */
export function escapeXmlText(value: string): string {
  return stripInvalidXmlChars(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Valor de atributo entre aspas duplas. */
export function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/**
 * Seção CDATA, como a documentação do VRSync recomenda para título e descrição. Um `]]>` no texto
 * fecharia a seção antes da hora: ele é partido em duas seções, que é a forma padrão de escapar.
 */
export function cdata(value: string): string {
  return `<![CDATA[${stripInvalidXmlChars(value).replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

/** Elemento simples com texto escapado; `null`/`undefined` não gera nada. */
export function element(
  name: string,
  value: string | number | null | undefined,
  attributes: Record<string, string> = {},
): string {
  if (value === null || value === undefined) {
    return '';
  }
  return `<${name}${renderAttributes(attributes)}>${escapeXmlText(String(value))}</${name}>`;
}

export function renderAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeXmlAttribute(value)}"`)
    .join('');
}
