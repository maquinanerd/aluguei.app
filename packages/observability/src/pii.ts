/**
 * Redação de dado pessoal por padrão de valor (auditoria 2026-09-10, P2-11). Complementa a
 * redação por caminho do logger: pega CPF, e-mail e telefone em texto livre — mensagens,
 * mensagens de erro do banco, URLs e campos fundos que nenhum caminho alcança.
 */

export const PII_CENSOR = {
  email: '[REDACTED:EMAIL]',
  cpf: '[REDACTED:CPF]',
  cnpj: '[REDACTED:CNPJ]',
  phone: '[REDACTED:PHONE]',
  document: '[REDACTED:DOC]',
} as const;

/** Ordem importa: formatos mais específicos primeiro (o telefone com +55 antes dos 11 dígitos). */
const VALUE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, PII_CENSOR.email],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, PII_CENSOR.cnpj],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, PII_CENSOR.cpf],
  // +55 11 91234-5678 · +5511912345678 · +55 (11) 1234-5678
  [/\+55[\s-]?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g, PII_CENSOR.phone],
  // (11) 91234-5678 · (11)1234-5678
  [/\(\d{2}\)\s?9?\d{4}[\s-]?\d{4}\b/g, PII_CENSOR.phone],
  // 11 91234-5678 · 91234-5678
  [/\b(?:\d{2}\s)?9\d{4}-\d{4}\b/g, PII_CENSOR.phone],
  // wa_id do WhatsApp e telefone sem máscara com o código do país: 5511912345678
  [/(?<![\d.\-/])55\d{10,11}(?![\d\-/])/g, PII_CENSOR.phone],
  // 11 dígitos soltos: CPF sem máscara ou celular com DDD
  [/(?<![\d.\-/])\d{11}(?![\d\-/])/g, PII_CENSOR.document],
];

/** Troca CPF, CNPJ, e-mail e telefone encontrados no texto por marcadores. */
export function redactPiiText(text: string): string {
  let out = text;
  for (const [pattern, censor] of VALUE_PATTERNS) {
    out = out.replace(pattern, censor);
  }
  return out;
}

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Cópia com os textos redigidos (nunca altera o objeto de quem loga). Só atravessa objetos
 * simples e arrays: instâncias (Error, request do Fastify, Buffer) ficam para os serializers.
 */
export function redactPiiDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return redactPiiText(value);
  }
  if (depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactPiiDeep(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = redactPiiDeep(item, depth + 1);
    }
    return copy;
  }
  return value;
}

/** Parâmetros de busca livre ou de dado pessoal: o valor inteiro sai do log. */
const REDACTED_QUERY_PARAMS = new Set(['q', 'query', 'search', 'email', 'cpf', 'cnpj', 'phone']);

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' '));
  } catch {
    return segment;
  }
}

/**
 * URL de requisição para log: valores de busca livre e de dado pessoal inteiros redigidos; nos
 * demais, CPF, e-mail e telefone por padrão (inclusive codificados na URL).
 */
export function redactUrl(url: string): string {
  const mark = url.indexOf('?');
  const path = mark === -1 ? url : url.slice(0, mark);
  const decodedPath = decodeSegment(path);
  const maskedPath = redactPiiText(decodedPath);
  const outPath = maskedPath === decodedPath ? path : maskedPath;
  if (mark === -1) {
    return outPath;
  }
  const params = url
    .slice(mark + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) {
        return pair;
      }
      const key = pair.slice(0, eq);
      if (REDACTED_QUERY_PARAMS.has(decodeSegment(key).toLowerCase())) {
        return `${key}=[REDACTED]`;
      }
      const raw = pair.slice(eq + 1);
      const decoded = decodeSegment(raw);
      const masked = redactPiiText(decoded);
      return `${key}=${masked === decoded ? raw : masked}`;
    });
  return `${outPath}?${params.join('&')}`;
}
