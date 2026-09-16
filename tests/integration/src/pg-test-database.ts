import { sql } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Remove o banco descartável de uma suíte `test:pg`. O `pool.end()` do node-postgres
 * resolve antes de o servidor fechar as conexões: um `drop database … with (force)`
 * nesse intervalo derruba uma conexão que ainda estava fechando, e o cliente emite
 * `57P01` como erro não tratado — o Vitest falha a execução mesmo com todos os
 * testes verdes (CI do PR #4). Espera o servidor soltar as conexões antes de remover.
 */
export async function dropTestDatabase(
  admin: AppDb,
  name: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await admin.execute(
      sql`select count(*)::int as n from pg_stat_activity where datname = ${name}`,
    );
    const open = (result.rows[0] as { n: number }).n;
    if (open === 0 || Date.now() > deadline) {
      break;
    }
    await sleep(100);
  }
  await admin.execute(sql.raw(`drop database if exists ${name} with (force)`));
}
