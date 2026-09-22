import { sql } from 'drizzle-orm';
import { check } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * CHECK de domínio fechado (auditoria 2026-09-10, P2-12): a coluna `text` só aceita o vocabulário
 * do domínio. O nome segue `<tabela>_<coluna>_valid`, e a lista tem de ser igual à constante de
 * `packages/domain` (ou, sem ela, ao enum de `packages/contracts`) — o teste
 * `tests/integration/src/g3-g-schema-domain.test.ts` compara as duas no banco migrado.
 *
 * Coluna anulável: o nulo continua aceito (`coluna is null or coluna in (...)`).
 */
export function domainCheck(
  name: string,
  column: AnyPgColumn,
  values: readonly string[],
  options: { nullable?: boolean } = {},
): ReturnType<typeof check> {
  const list = sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', '));
  return options.nullable
    ? check(name, sql`${column} is null or ${column} in (${list})`)
    : check(name, sql`${column} in (${list})`);
}
