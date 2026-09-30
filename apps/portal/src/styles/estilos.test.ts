import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Base visual do portal (Onda 1B da rodada de fidelidade, ADR-105).
 *
 * Os `--type-*` são o atalho `font` completo (peso, tamanho/altura de linha e família). Usados
 * em `font-size`, a declaração fica inválida e o navegador cai no tamanho herdado: todo título e
 * todo preço do portal saía com 16px (defeito 14 do plano, medido no Chromium).
 */

const ler = (arquivo: string) =>
  readFileSync(fileURLToPath(new URL(`./${arquivo}`, import.meta.url)), 'utf8');

const TOKENS = ler('tokens.css');
const ESTILOS = ['portal.css', 'telas.css'].map((arquivo) => ({ arquivo, css: ler(arquivo) }));

describe('tipografia do portal', () => {
  it('token de tipo nunca vai em font-size (vira 16px herdado)', () => {
    const usos = ESTILOS.flatMap(({ arquivo, css }) =>
      [...css.matchAll(/font-size:\s*var\(--type-[a-z-]+\)/g)].map((m) => `${arquivo}: ${m[0]}`),
    );
    expect(usos).toEqual([]);
  });

  it('todo uso de token de tipo é pelo atalho font', () => {
    const fora = ESTILOS.flatMap(({ arquivo, css }) =>
      css
        .split('\n')
        .filter((linha) => /var\(--type-/.test(linha) && !/^\s*font:\s*var\(--type-/.test(linha))
        .map((linha) => `${arquivo}: ${linha.trim()}`),
    );
    expect(fora).toEqual([]);
  });

  it('a escala segue a tabela da identidade (00-identidade)', () => {
    expect(TOKENS).toContain('--type-h1-home: 700 clamp(30px, 4.2vw, 52px)/1.1');
    expect(TOKENS).toContain('--type-h1: 800 clamp(28px, 4vw, 46px)/1.08');
    expect(TOKENS).toContain('--type-price-xl: 800 clamp(34px, 4.4vw, 52px)/1');
    expect(TOKENS).toContain('--type-card-title: 600');
  });
});

describe('estilo do portal', () => {
  it('sem caixa alta, que o design proíbe', () => {
    const achados = ESTILOS.filter(({ css }) => /text-transform:\s*uppercase/.test(css)).map(
      ({ arquivo }) => arquivo,
    );
    expect(achados).toEqual([]);
  });

  it('o quadro de referência é o de 1440, com 64px de margem lateral no desktop', () => {
    expect(TOKENS).toContain('--portal-max: 1440px');
    expect(TOKENS).toMatch(/@media \(min-width: 1280px\)[\s\S]*--portal-gutter: 64px/);
  });
});
