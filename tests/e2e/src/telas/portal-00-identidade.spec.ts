import { expect, test } from '@playwright/test';
import { PORTAL } from '../g2-b1-support';
import { abrirJanela, capturarPagina } from './captura';

/**
 * Tela 01 do checklist (`portal/00-identidade`): `/dev/componentes` na largura e na escala do print
 * (1280, 1x, página inteira), mais a mesma página em 390 para ver as formas do celular. A stack de
 * E2E sobe o portal com `next dev`, onde a rota existe; em produção ela responde 404.
 */

test.setTimeout(180_000);

for (const janela of [
  { largura: 1280, tela: '00-identidade' },
  { largura: 390, tela: '00-identidade-390' },
]) {
  test(`@tela-01 identidade do portal em ${String(janela.largura)}`, async ({ browser }) => {
    const contexto = await abrirJanela(browser, { largura: janela.largura });
    const page = await contexto.newPage();
    // A primeira abertura compila a página no `next dev`.
    await page.goto(`${PORTAL}/dev/componentes`, { timeout: 120_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'AchouImóvel: identidade do portal' }),
    ).toBeVisible();
    // Em texto: o tsconfig do E2E não tem o DOM, e a Guton precisa estar carregada na captura.
    await page.evaluate('document.fonts.ready.then(() => true)');
    // O card de verdade, com os dados da tela, escreve os textos da amostra.
    await expect(page.getByText('Aluguel R$ 2.300 · Cond. R$ 480 · IPTU R$ 130')).toBeVisible();
    await capturarPagina(page, { area: 'portal', tela: janela.tela }, { largura: janela.largura });
    await contexto.close();
  });
}
