import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Locator, Page } from '@playwright/test';

/**
 * Captura de tela para a comparação com os prints do pacote de design (rodada de fidelidade,
 * ADR-105, T5). Cada tela do `SCREENS.md` sai na largura do artboard e na escala em que o print foi
 * exportado (celular e blocos em 2x), recortada como o print: a página inteira, a janela, ou só o
 * elemento quando o artboard é "só o que muda". Prints com vários quadros lado a lado são montados
 * numa página local com o mesmo vão do print — sem biblioteca de imagem nova.
 *
 * O arquivo sai em `docs/frontend/achouimovel-evidence/<área>/<tela>__impl.png`, o caminho que o
 * checklist (`docs/frontend/ACHOUIMOVEL_CHECKLIST.md`) usa para marcar a tela como conferida.
 */

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));
export const PASTA_DE_EVIDENCIA = join(RAIZ, 'docs', 'frontend', 'achouimovel-evidence');

export type Area = 'portal' | 'conta' | 'gestao' | 'cliente';

export interface Janela {
  largura: number;
  /** Altura fixa do artboard (ex.: 844 no celular); sem ela, a página inteira. */
  altura?: number;
  /** 2 nos prints de celular e de bloco, que foram exportados em 2x. */
  escala?: 1 | 2;
}

export function caminhoDaEvidencia(area: Area, tela: string): string {
  return join(PASTA_DE_EVIDENCIA, area, `${tela}__impl.png`);
}

/**
 * Abre um contexto com a janela e a escala do print. Datas do navegador ficam no fuso de São
 * Paulo e em pt-BR, como nas telas.
 */
export async function abrirJanela(browser: Browser, janela: Janela, cookie?: string) {
  const contexto = await browser.newContext({
    viewport: { width: janela.largura, height: janela.altura ?? 900 },
    deviceScaleFactor: janela.escala ?? 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  });
  if (cookie !== undefined) {
    const [nome, ...resto] = (cookie.split(';')[0] ?? '').split('=');
    await contexto.addCookies([
      { name: nome ?? '', value: resto.join('='), url: 'http://localhost', path: '/' },
    ]);
  }
  return contexto;
}

export interface Captura {
  area: Area;
  tela: string;
  /** Áreas mascaradas na comparação (foto, data do servidor): T7 do ADR-105. */
  mascaras?: Locator[];
}

/**
 * A stack de E2E roda o portal e o painel com `next dev`, que desenha o indicador de
 * desenvolvimento no canto da página. Ele não é da tela e sai da captura.
 */
async function semIndicadorDoNext(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

/** Página inteira, ou só a janela quando o artboard tem altura fixa. */
export async function capturarPagina(page: Page, captura: Captura, janela: Janela) {
  const arquivo = caminhoDaEvidencia(captura.area, captura.tela);
  mkdirSync(dirname(arquivo), { recursive: true });
  await semIndicadorDoNext(page);
  await page.screenshot({
    path: arquivo,
    fullPage: janela.altura === undefined,
    animations: 'disabled',
    ...(captura.mascaras === undefined ? {} : { mask: captura.mascaras }),
  });
  return arquivo;
}

/** Só o elemento, para os artboards de recorte (BlocoValor, diálogo, cartão). */
export async function capturarElemento(elemento: Locator, captura: Captura) {
  const arquivo = caminhoDaEvidencia(captura.area, captura.tela);
  mkdirSync(dirname(arquivo), { recursive: true });
  await semIndicadorDoNext(elemento.page());
  await elemento.screenshot({
    path: arquivo,
    animations: 'disabled',
    ...(captura.mascaras === undefined ? {} : { mask: captura.mascaras }),
  });
  return arquivo;
}

/**
 * Monta vários quadros (PNGs já capturados) lado a lado, com o vão do print, e grava a imagem
 * final. A montagem é uma página HTML local renderizada pelo próprio Chromium.
 */
export async function montarQuadros(
  browser: Browser,
  quadros: string[],
  opcoes: { area: Area; tela: string; vao: number; escala: 1 | 2 },
) {
  const imagens = quadros.map(
    (arquivo) => `data:image/png;base64,${readFileSync(arquivo).toString('base64')}`,
  );
  const contexto = await browser.newContext({ deviceScaleFactor: 1 });
  const pagina = await contexto.newPage();
  const vao = opcoes.vao * opcoes.escala;
  await pagina.setContent(
    `<!doctype html><html><body style="margin:0;background:#fff">` +
      `<div id="quadros" style="display:inline-flex;align-items:flex-start;gap:${String(vao)}px">` +
      imagens.map((src) => `<img src="${src}" style="display:block">`).join('') +
      `</div></body></html>`,
  );
  const arquivo = caminhoDaEvidencia(opcoes.area, opcoes.tela);
  mkdirSync(dirname(arquivo), { recursive: true });
  await pagina.locator('#quadros').screenshot({ path: arquivo });
  await contexto.close();
  return arquivo;
}
