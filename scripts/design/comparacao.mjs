#!/usr/bin/env node
/**
 * Gera `docs/frontend/achouimovel-evidence/COMPARACAO.md`: para cada linha do `SCREENS.md`, o
 * print do pacote de design ao lado da captura da implementação, quando ela existe (rodada de
 * fidelidade às telas, ADR-105, F6). É o que o PR de cada onda mostra para a revisão tela a tela.
 *
 * Uso: `node scripts/design/comparacao.mjs` (ou `pnpm design:comparacao`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const PACOTE = join(RAIZ, 'design-source', 'achouimovel');
const EVIDENCIA = join(RAIZ, 'docs', 'frontend', 'achouimovel-evidence');
const SAIDA = join(EVIDENCIA, 'COMPARACAO.md');

const linhas = readFileSync(join(PACOTE, 'SCREENS.md'), 'utf8')
  .split('\n')
  .filter((linha) => /^\| \d\d \|/.test(linha))
  .map((linha) => {
    const colunas = linha.split('|').map((coluna) => coluna.trim());
    const print = colunas[3].replace(/`/g, '');
    return {
      numero: colunas[1],
      area: colunas[2],
      print,
      tela: basename(print, '.png'),
      oQue: colunas[6],
    };
  });

// Caminho com barra normal, relativo ao COMPARACAO.md, para o GitHub mostrar a imagem.
const link = (arquivo) => relative(EVIDENCIA, arquivo).split('\\').join('/');

const comCaptura = [];
const semCaptura = [];
for (const tela of linhas) {
  const impl = join(EVIDENCIA, tela.area, `${tela.tela}__impl.png`);
  (existsSync(impl) ? comCaptura : semCaptura).push({ ...tela, impl });
}

const partes = [
  '# AchouImóvel · print × implementação',
  '',
  'Gerado por `scripts/design/comparacao.mjs` a partir do `SCREENS.md` e das capturas da CI',
  '(`tests/e2e/src/telas/`). Diferença aceita: só dado, ou item do §7 do plano',
  '(`docs/frontend/ACHOUIMOVEL_PLAN.md`); o estado de cada tela fica no checklist.',
  '',
  `Telas com captura: ${String(comCaptura.length)} de ${String(linhas.length)}.`,
  '',
];
for (const tela of comCaptura) {
  partes.push(
    `## ${tela.numero} · ${tela.area}/${tela.tela}`,
    '',
    tela.oQue,
    '',
    '| Print | Implementação |',
    '| --- | --- |',
    `| ![print](${link(join(PACOTE, tela.print))}) | ![implementação](${link(tela.impl)}) |`,
    '',
  );
}
if (semCaptura.length > 0) {
  partes.push(
    '## Sem captura ainda',
    '',
    ...semCaptura.map((tela) => `- ${tela.numero} · ${tela.area}/${tela.tela}`),
    '',
  );
}

mkdirSync(EVIDENCIA, { recursive: true });
writeFileSync(SAIDA, partes.join('\n'));
console.log(
  `${relative(RAIZ, SAIDA)}: ${String(comCaptura.length)} de ${String(linhas.length)} telas com captura.`,
);
