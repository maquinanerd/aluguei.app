import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Onda 0 da rodada de fidelidade (defeitos 1 e 2): "Pedir link" e "Pagar com Pix" chamavam
 * `/api/portal/...` sem rota no painel — em produção davam 404, e nenhum teste clicava nos
 * botões. Este teste liga cada `fetch('/api/…')` escrito à mão no código do painel a um
 * `route.ts` de verdade, para que a próxima chamada órfã quebre aqui e não no navegador.
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url));
const API = join(SRC, 'app', 'api');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/** Caminhos `/api/…` passados literalmente a `fetch`, com `${…}` como segmento variável. */
function chamadas(): { arquivo: string; caminho: string }[] {
  const achadas: { arquivo: string; caminho: string }[] = [];
  for (const arquivo of arquivos(SRC)) {
    const fonte = readFileSync(arquivo, 'utf8');
    for (const m of fonte.matchAll(/fetch\(\s*(['`])(\/api\/[^'`]*)\1/g)) {
      const caminho = (m[2] ?? '').split('?')[0] ?? '';
      achadas.push({ arquivo: relative(SRC, arquivo).split(sep).join('/'), caminho });
    }
  }
  return achadas;
}

/** Existe `route.ts` que atende o caminho? Segmento `${…}` casa com `[param]`. */
function temRota(caminho: string): boolean {
  const segmentos = caminho.replace(/^\/api\//, '').split('/');
  let dirs = [API];
  for (const segmento of segmentos) {
    const variavel = segmento.includes('${');
    const proximos: string[] = [];
    for (const dir of dirs) {
      for (const nome of readdirSync(dir)) {
        const caminhoFilho = join(dir, nome);
        if (!statSync(caminhoFilho).isDirectory()) continue;
        if (nome.startsWith('[...')) return true;
        if (nome === segmento || (nome.startsWith('[') && (variavel || !segmento.includes('.')))) {
          proximos.push(caminhoFilho);
        }
      }
    }
    dirs = proximos;
    if (dirs.length === 0) return false;
  }
  return dirs.some((dir) => readdirSync(dir).some((nome) => /^route\.tsx?$/.test(nome)));
}

describe('chamadas do painel a /api', () => {
  it('encontra as chamadas escritas à mão (o teste não passa em branco)', () => {
    expect(chamadas().length).toBeGreaterThanOrEqual(5);
  });

  it('toda chamada a /api/… tem route.ts no painel', () => {
    const orfas = chamadas()
      .filter(({ caminho }) => !caminho.startsWith('/api/backend'))
      .filter(({ caminho }) => !temRota(caminho))
      .map(({ arquivo, caminho }) => `${arquivo} → ${caminho}`);
    expect(orfas).toEqual([]);
  });
});
