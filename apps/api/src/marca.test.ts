import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOME_DO_PAINEL } from './marca.js';

/**
 * Onda 0 da rodada de fidelidade, defeito 17: o assunto dos e-mails de senha e de convite ainda
 * dizia "Aluguei.app". O painel já tem a marca num lugar só (ADR-098, `apps/web/src/lib/brand.ts`)
 * e um teste que falha se o nome antigo voltar; a API passa a ter o mesmo.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url));

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.ts$/.test(nome) && !/\.test\.ts$/.test(nome) ? [caminho] : [];
  });
}

describe('marca na API', () => {
  it('o painel se chama AchouImóvel Gestão', () => {
    expect(NOME_DO_PAINEL).toBe('AchouImóvel Gestão');
  });

  it('nenhuma mensagem da API usa o nome antigo', () => {
    const comNomeAntigo = arquivos(SRC)
      .filter((arquivo) => readFileSync(arquivo, 'utf8').includes('Aluguei.app'))
      .map((arquivo) => relative(SRC, arquivo).split(sep).join('/'));
    expect(comNomeAntigo).toEqual([]);
  });
});
