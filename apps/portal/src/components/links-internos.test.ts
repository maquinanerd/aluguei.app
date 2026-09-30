import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LINKS_B2B, LINKS_CONSUMIDOR } from './SiteHeader';
import { COLUNAS, LEGAIS } from './SiteFooter';

/**
 * Defeito 6 da Onda 0 (rodada de fidelidade): o cabeçalho e o rodapé apontavam para páginas que o
 * portal não tem (`/cidades`, `/sobre`, `/ajuda`, `/alerta`, `/login`, `/termos`, `/privacidade`,
 * `/cookies`, `/para-imobiliarias/anunciar`) — todas 404 em produção. Link interno só existe se
 * houver `page.tsx` que o atenda.
 */

const APP = fileURLToPath(new URL('../app', import.meta.url));

function diretorios(dir: string): string[] {
  return readdirSync(dir).filter((nome) => statSync(join(dir, nome)).isDirectory());
}

function atende(dir: string, segmentos: string[]): boolean {
  const filhos = diretorios(dir);
  // Grupo de rota "(nome)" não entra no caminho.
  if (filhos.some((nome) => nome.startsWith('(') && atende(join(dir, nome), segmentos)))
    return true;
  if (segmentos.length === 0) {
    if (existsSync(join(dir, 'page.tsx'))) return true;
    // Catch-all opcional atende o caminho vazio.
    return filhos.some(
      (nome) => nome.startsWith('[[...') && existsSync(join(dir, nome, 'page.tsx')),
    );
  }
  const [primeiro, ...resto] = segmentos;
  return filhos.some((nome) => {
    if (nome === primeiro) return atende(join(dir, nome), resto);
    if (nome.startsWith('[[...') || nome.startsWith('[...')) {
      return existsSync(join(dir, nome, 'page.tsx'));
    }
    return nome.startsWith('[') && !nome.startsWith('(') && atende(join(dir, nome), resto);
  });
}

function temPagina(href: string): boolean {
  const caminho = href.split('?')[0] ?? '';
  return atende(
    APP,
    caminho.split('/').filter((parte) => parte !== ''),
  );
}

const TODOS: { href: string; rotulo: string; painel?: boolean }[] = [
  ...LINKS_CONSUMIDOR,
  ...LINKS_B2B,
  ...COLUNAS.flatMap((coluna) => coluna.links),
  ...LEGAIS,
];
const INTERNOS = TODOS.filter((link) => link.href.startsWith('/') && link.painel !== true);
// Links do painel (outro host) apontam para páginas do `apps/web`.
const PAINEL = fileURLToPath(new URL('../../../web/src/app', import.meta.url));

describe('links do cabeçalho e do rodapé', () => {
  it('há links internos para conferir (o teste não passa em branco)', () => {
    expect(INTERNOS.length).toBeGreaterThanOrEqual(8);
  });

  it('todo link interno leva a uma página que existe no portal', () => {
    const quebrados = INTERNOS.filter((link) => !temPagina(link.href)).map(
      (link) => `${link.rotulo} → ${link.href}`,
    );
    expect(quebrados).toEqual([]);
  });

  it('link para o painel leva a uma página que existe no painel', () => {
    const doPainel = TODOS.filter((link) => link.painel === true);
    expect(doPainel.map((link) => link.rotulo)).toContain('Entrar');
    const quebrados = doPainel
      .filter(
        (link) =>
          !atende(
            PAINEL,
            link.href.split('/').filter((parte) => parte !== ''),
          ),
      )
      .map((link) => `${link.rotulo} → ${link.href}`);
    expect(quebrados).toEqual([]);
  });
});
