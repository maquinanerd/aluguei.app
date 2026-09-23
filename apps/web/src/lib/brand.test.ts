import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND, tituloGestao, tituloPortal } from './brand';

/**
 * Rebrand do AchouImóvel (Onda 1B): o nome do produto sai de um lugar só. O
 * segundo teste é a trava — o nome antigo não pode voltar escrito à mão, que é
 * exatamente o problema que o redesenho pediu para resolver.
 */
describe('marca', () => {
  it('nomes do consumidor e do lado pago', () => {
    expect(BRAND.name).toBe('AchouImóvel');
    expect(BRAND.b2bName).toBe('AchouImóvel Gestão');
    expect(BRAND.seal).toBe('A');
    expect(tituloGestao('Imóveis')).toBe('Imóveis | AchouImóvel Gestão');
    expect(tituloPortal('Entrar')).toBe('Entrar | AchouImóvel');
  });

  it('nenhum arquivo do app volta a escrever o nome antigo à mão', () => {
    const raiz = fileURLToPath(new URL('..', import.meta.url));
    const ignorados = new Set(['brand.ts', 'brand.test.ts']);
    const achados: string[] = [];

    const varrer = (dir: string): void => {
      for (const entrada of readdirSync(dir)) {
        const caminho = join(dir, entrada);
        if (statSync(caminho).isDirectory()) {
          varrer(caminho);
          continue;
        }
        if (!/\.(ts|tsx|css)$/.test(entrada) || ignorados.has(entrada)) {
          continue;
        }
        if (readFileSync(caminho, 'utf8').includes('Aluguei.app')) {
          achados.push(caminho);
        }
      }
    };
    varrer(raiz);

    expect(achados, 'use BRAND em vez do nome escrito à mão').toEqual([]);
  });
});
