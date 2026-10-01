import { expect, test } from '@playwright/test';
import { registerViaApi, useSession } from './g2-b1-support';

/**
 * Cadastro de imóvel por áudio (ADR-104), pela interface.
 *
 * O que este spec cobre é a **tela**: o caminho de dados (transcrever, redigir,
 * extrair, confirmar) está na integração, com o transcritor de mentira. A stack
 * de E2E tem storage em disco (F3), mas gravar áudio no navegador de teste não
 * diria nada sobre o transcritor de verdade.
 *
 * Aqui interessa que o corretor chegue à tela pelo caminho normal, que ela
 * avise que a transcrição é simulação **antes** de ele gravar três minutos, e
 * que nada quebre no navegador.
 */

test.describe('Cadastro por áudio', () => {
  test('chega pela lista de imóveis e avisa que a transcrição é simulação', async ({ page }) => {
    const { cookie } = await registerViaApi('audio');
    await useSession(page, cookie);

    const erros: string[] = [];
    page.on('pageerror', (err) => erros.push(err.message));

    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'Por áudio' }).click();
    await expect(page).toHaveURL(/\/app\/properties\/new-by-audio/);

    await expect(page.getByRole('heading', { name: 'Novo imóvel por áudio' })).toBeVisible();
    // A stack de E2E declara retenção zero com o transcritor de mentira. A tela
    // tem de dizer que é simulação antes de alguém confiar nos campos.
    await expect(page.getByText(/simula/i).first()).toBeVisible();
    // E tem de dizer, na própria tela, que a confirmação é de uma pessoa.
    await expect(page.getByText(/Nada é salvo sem a sua confirmação/i)).toBeVisible();

    // O roteiro do ditado aparece antes de gravar: quem fala precisa saber o quê.
    await expect(page.getByText('Fale o que souber, em qualquer ordem')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: '../../docs/audits/2026-09-29/evidence/front/audio/captura-celular.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: '../../docs/audits/2026-09-29/evidence/front/audio/captura-desktop.png',
      fullPage: true,
    });

    expect(erros, 'erros de página').toEqual([]);
  });

  test('o shell continua disponível: a tela não entra em Focus Mode', async ({ page }) => {
    // O cadastro comum esconde o menu de propósito; este é usado no celular e
    // precisa do caminho de volta.
    const { cookie } = await registerViaApi('audio-shell');
    await useSession(page, cookie);
    await page.goto('/app/properties/new-by-audio');
    await expect(page.getByRole('navigation', { name: 'Trilha de navegação' })).toBeVisible();
  });
});
