import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * P0-07 (auditoria 2026-09-10): três telas convertiam o valor digitado com
 * `parseFloat(v.replace(',', '.'))` — "3.500" virava R$ 3,50 e ia para a
 * locação e as cobranças. Dinheiro digitado pelo usuário passa só por
 * `MoneyInput`/`parseMoneyInput` de @aluguei/ui; esta guarda impede a volta do
 * parsing local.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

const LOCAL_MONEY_PARSING = [
  /parseFloat\([^)]*\.replace\(\s*['"`],['"`]\s*,\s*['"`]\.['"`]\s*\)/,
  /Number\([^)]*\.replace\(\s*['"`],['"`]\s*,\s*['"`]\.['"`]\s*\)/,
];

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('P0-07: o web não converte dinheiro com parsing local', () => {
  it('nenhum arquivo usa parseFloat/Number sobre replace(",", ".")', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const rel = relative(SRC_DIR, file).replaceAll('\\', '/');
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((text, index) => {
          if (LOCAL_MONEY_PARSING.some((pattern) => pattern.test(text))) {
            offenders.push(`${rel}:${String(index + 1)}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
