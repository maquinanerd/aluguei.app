import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Texto com UTF-8 decodificado duas vezes (auditoria 2026-09-10, P3 "mojibake em
 * places.ts/properties.ts"): a API respondia "Imóvel não encontrado" com os acentos
 * corrompidos e as telas mostravam a mensagem assim. A varredura cobre o código do
 * monorepo; as evidências da auditoria ficam de fora — registram o que foi produzido
 * na época.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const SOURCE_ROOTS = ['apps', 'packages', 'tests', 'scripts'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.expo',
  'test-results',
  'playwright-report',
]);
const TEXT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|css|md|sql|ya?ml|html)$/;

/** Byte de continuação UTF-8 (0x80–0xBF) lido como Latin-1 ou Windows-1252. */
const CONT =
  '[\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC' +
  '\\u2013\\u2014\\u2018-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]';
/** Início de sequência de 2 bytes (Â, Ã), de 3 bytes (â) e de 4 bytes (ð) seguido das continuações. */
const MOJIBAKE = new RegExp(`[\\u00C2\\u00C3]${CONT}|\\u00E2${CONT}{2}|\\u00F0${CONT}{3}`, 'u');

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(join(dir, entry.name));
    } else if (TEXT_FILE.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

function brokenLines(text: string): number[] {
  return text.split('\n').flatMap((line, index) => (MOJIBAKE.test(line) ? [index + 1] : []));
}

describe('texto do código-fonte em UTF-8 sem dupla decodificação', () => {
  it('o detector reconhece acentos, setas, travessões e emoji decodificados duas vezes', () => {
    const original = 'Imóvel não encontrado — ação → ok ✅ 😀';
    const bytes = Buffer.from(original, 'utf8');
    for (const broken of [
      bytes.toString('latin1'),
      new TextDecoder('windows-1252').decode(bytes),
    ]) {
      expect(brokenLines(broken)).toEqual([1]);
    }
    expect(brokenLines(original)).toEqual([]);
    expect(brokenLines('NÃO, AÇÃO, ÂNGULO, à noite, nº 10, 30°')).toEqual([]);
  });

  it('nenhum arquivo de código tem texto decodificado duas vezes', () => {
    const findings: string[] = [];
    let scanned = 0;
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(join(ROOT, root))) {
        scanned += 1;
        const lines = brokenLines(readFileSync(file, 'utf8'));
        if (lines.length > 0) {
          findings.push(`${relative(ROOT, file).replaceAll('\\', '/')}:${lines.join(',')}`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(200);
    expect(findings).toEqual([]);
  });
});
