import { expect, test } from '@playwright/test';
import { useSession } from '../g2-b1-support';
import { abrirJanela, capturarPagina } from './captura';
import { SEGUNDA_0912, WEB, imobiliariaExemplo } from './fixture-gestao';
import { semearVisaoGeral } from './fixture-visao-geral';

/**
 * Capturas das telas da gestão (rodada de fidelidade, ADR-105): 1440 × 940 em 1x, como os
 * artboards de `telas/gestao/01-painel.dc.html`. Em série, porque as telas usam a mesma
 * "Imobiliária Exemplo" em planos diferentes.
 */

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const JANELA = { largura: 1440, altura: 940 } as const;

// Primeiro a Visão Geral: a semente dela dá ao menu os contadores dos dois prints (Leads 7 e
// Tarefas 3), que a tela 33 também mostra.
test('@tela-32 Visão Geral no plano Gestão Locação', async ({ browser }) => {
  test.setTimeout(420_000);
  const exemplo = await imobiliariaExemplo('GESTAO_LOCACAO');
  await semearVisaoGeral(exemplo.cookie);

  const contexto = await abrirJanela(browser, JANELA);
  const page = await contexto.newPage();
  await page.clock.setFixedTime(SEGUNDA_0912);
  await useSession(page, exemplo.cookie);
  await page.goto(`${WEB}/app`, { timeout: 180_000 });

  await expect(page.getByRole('heading', { level: 1, name: 'Bom dia, Rafael' })).toBeVisible();
  await expect(page.getByText('3 pendências exigem atenção hoje.')).toBeVisible();
  await expect(page.getByText('5 item(ns) exigem atenção')).toBeVisible();
  const fila = page.locator('.dash-fila__lista');
  for (const linha of [
    /Mariana Costa · sem retorno há \d+ min/,
    'João Pereira · Casa Jardim América',
    'Carlos Dias · Apto 3 qts Marista',
    'Entrada · Apto 804 Setor Marista',
    'Canal de teste recusou o anúncio · endereço público (cidade) é obrigatório',
  ]) {
    await expect(fila.getByText(linha)).toBeVisible();
  }
  const reservados = page
    .locator('.dash-summary')
    .filter({ has: page.getByRole('heading', { name: 'Imóveis', exact: true }) })
    .locator('.dash-summary__row')
    .filter({ hasText: 'Reservados' })
    .locator('.dash-summary__value');
  await expect(reservados).toHaveText('1');
  const demanda = page.locator('.dash-demanda');
  await expect(demanda.getByText('Setor Bueno')).toBeVisible();
  await expect(demanda.getByText('· Apto 2 qts')).toBeVisible();
  await expect(demanda.getByText('Setor Universitário')).toBeVisible();
  await page.evaluate('document.fonts.ready.then(() => true)');

  await capturarPagina(page, { area: 'gestao', tela: '01-visao-geral' }, JANELA);
  await contexto.close();
});

test('@tela-33 upgrade no lugar: Locações no plano Anunciante', async ({ browser }) => {
  const exemplo = await imobiliariaExemplo('ANUNCIANTE');
  const contexto = await abrirJanela(browser, JANELA);
  const page = await contexto.newPage();
  await page.clock.setFixedTime(SEGUNDA_0912);
  await useSession(page, exemplo.cookie);
  await page.goto(`${WEB}/app/leases`, { timeout: 180_000 });

  // O item abre a própria rota, fica aceso com o cadeado, e a tela é a de upgrade.
  const menu = page.locator('aside.app-sidebar');
  const locacoes = menu.getByRole('link', { name: /Locações/ });
  await expect(locacoes).toHaveAttribute('aria-current', 'page');
  await expect(locacoes).toHaveAttribute('href', '/app/leases');
  await expect(page.getByText('Fora do seu plano').first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Locações estão disponíveis no AchouImóvel Gestão Locação/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir o Gestão Locação' })).toBeVisible();
  // O menu mostra "Painel de vendas" só pelo link em Negociações (T9).
  await expect(menu.getByText('Painel de vendas')).toHaveCount(0);
  await page.evaluate('document.fonts.ready.then(() => true)');

  await capturarPagina(page, { area: 'gestao', tela: '02-upgrade-plano' }, JANELA);

  // Pedir registra o pedido e a tela passa a mostrá-lo (B15).
  await page.getByRole('button', { name: 'Pedir o Gestão Locação' }).click();
  await expect(page.getByText(/Pedido registrado em/)).toBeVisible();
  await contexto.close();
});
