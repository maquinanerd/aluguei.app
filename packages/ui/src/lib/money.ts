/**
 * CONTROLE NEGATIVO do P0-07 (auditoria 2026-09-10). Versionado apenas no
 * commit de RED e substituído pela implementação no commit de correção.
 * Reproduz o parsing que o web usa hoje, `parseFloat(v.replace(',', '.'))`:
 * property-detail-client.tsx:629-632, proposals-client.tsx:293,
 * leads-client.tsx:335 e properties/new/property-form.tsx:72-75.
 */
export const MONEY_INPUT_MAX_CENTS = 2_147_483_647;

export type DecimalParseResult =
  { ok: true; units: number | null } | { ok: false; code: string; message: string };

export type MoneyParseResult =
  { ok: true; cents: number | null } | { ok: false; code: string; message: string };

function legacyParse(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

export function parseDecimalInput(
  raw: string,
  options: { fractionDigits: number },
): DecimalParseResult {
  const n = legacyParse(raw);
  return {
    ok: true,
    units: Number.isFinite(n) && n > 0 ? Math.round(n * 10 ** options.fractionDigits) : null,
  };
}

export function parseMoneyInput(
  raw: string,
  _options: { maxCents?: number } = {},
): MoneyParseResult {
  const n = legacyParse(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: true, cents: null };
  }
  return { ok: true, cents: Math.round(n * 100) };
}

export function formatCentsForInput(cents: number): string {
  return String(cents / 100);
}
