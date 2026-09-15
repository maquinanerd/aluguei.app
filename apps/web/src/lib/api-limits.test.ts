import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { paginationQuerySchema } from '@aluguei/contracts';

/**
 * P1-01 (auditoria 2026-09-10): o web pedia `?limit=200` em 37 chamadas e a API
 * aceita no máximo 100 — cada uma devolvia 400 em silêncio (dashboard zerado,
 * selects vazios, nomes "—"). A varredura lê o código do web e valida cada
 * limite literal contra o schema real da API, não contra um número copiado.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

const LITERAL_LIMIT_PATTERNS = [
  /[?&]limit=(\d+)/g,
  /\blimit:\s*['"`](\d+)['"`]/g,
  /\.set\(\s*['"`]limit['"`]\s*,\s*['"`](\d+)['"`]\s*\)/g,
];

const DYNAMIC_LIMIT_PATTERNS = [
  /[?&]limit=\$\{/,
  /\.set\(\s*['"`]limit['"`]\s*,\s*(?!['"`]\d+['"`]\s*\))/,
  /\blimit:\s*(?!['"`]\d+['"`])[A-Za-z_(]/,
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

interface LimitHit {
  where: string;
  limit: number | null;
}

function scan(): LimitHit[] {
  const hits: LimitHit[] = [];
  for (const file of sourceFiles(SRC_DIR)) {
    const rel = relative(SRC_DIR, file).replaceAll('\\', '/');
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        const where = `${rel}:${String(index + 1)}`;
        for (const pattern of LITERAL_LIMIT_PATTERNS) {
          for (const match of text.matchAll(pattern)) {
            hits.push({ where, limit: Number(match[1]) });
          }
        }
        if (DYNAMIC_LIMIT_PATTERNS.some((pattern) => pattern.test(text))) {
          hits.push({ where, limit: null });
        }
      });
  }
  return hits;
}

describe('P1-01: nenhuma chamada do web pede limit acima do aceito pela API', () => {
  const hits = scan();

  it('a varredura encontra as chamadas paginadas do web (não está cega)', () => {
    expect(hits.filter((hit) => hit.limit !== null).length).toBeGreaterThan(10);
  });

  it('todo limit literal é aceito pelo paginationQuerySchema da API', () => {
    const rejected = hits
      .filter((hit) => hit.limit !== null)
      .filter((hit) => !paginationQuerySchema.safeParse({ limit: hit.limit }).success)
      .map((hit) => `${hit.where} limit=${String(hit.limit)}`);
    expect(rejected).toEqual([]);
  });

  it('nenhum limit é calculado em tempo de execução (só literais, que esta varredura valida)', () => {
    const dynamic = hits.filter((hit) => hit.limit === null).map((hit) => hit.where);
    expect(dynamic).toEqual([]);
  });
});
