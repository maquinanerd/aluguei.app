import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { api, loginViaApi, registerViaApi, useSession, WEB } from './g2-b1-support';
import type { Account } from './g2-b1-support';

/**
 * P1-03 (auditoria 2026-09-10): "Sair" ignorava a resposta (o logout chegava à
 * API como 400 pelo BFF) e mandava para /login com a sessão ainda válida; no
 * portal, "Sair" era só um link para "/".
 *
 * Limite do portal: a revogação da sessão no servidor fica em
 * apps/api/src/routes/portal.ts (POST /portal/auth/logout só limpa o cookie),
 * fora dos arquivos da Track B1. O spec do portal prova o que o web garante: a
 * chamada ao logout, o navegador sem o cookie e /inquilino voltando para "/".
 */

async function expectBackofficeSessionRevoked(page: Page, cookie: string): Promise<void> {
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/, { timeout: 60_000 });
  const me = await api('GET', '/auth/me', { cookie });
  expect(me.status, 'o cookie antigo não pode continuar autenticando na API').toBe(401);
}

test.describe('P1-03: logout encerra a sessão', () => {
  let account: Account;

  test.beforeAll(async () => {
    account = await registerViaApi('logout');
  });

  test('"Sair" no menu da conta do topo revoga a sessão', async ({ page }) => {
    test.setTimeout(240_000);
    await useSession(page, account.cookie);
    await page.goto('/app');
    await page.locator('header.app-topbar').getByRole('button', { name: 'Menu da conta' }).click();
    const logout = page.waitForResponse((res) => res.url().endsWith('/api/auth/logout'));
    await page.locator('header.app-topbar').getByRole('menuitem', { name: 'Sair' }).click();
    expect((await logout).status()).toBe(200);
    await expectBackofficeSessionRevoked(page, account.cookie);
  });

  test('"Sair" no menu do perfil da barra lateral revoga a sessão', async ({ page }) => {
    test.setTimeout(240_000);
    const session = await loginViaApi(account);
    await useSession(page, session.cookie);
    await page.goto('/app');
    const sidebar = page.locator('aside.app-sidebar');
    await sidebar.getByRole('button', { name: 'Menu da conta' }).click();
    const logout = page.waitForResponse((res) => res.url().endsWith('/api/auth/logout'));
    await sidebar.getByRole('menuitem', { name: 'Sair' }).click();
    expect((await logout).status()).toBe(200);
    await expectBackofficeSessionRevoked(page, session.cookie);
  });

  test('"Sair" do portal do locatário encerra a sessão do portal no navegador', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const session = await loginViaApi(account);
    const party = await api<{ party: { id: string } }>('POST', '/parties', {
      cookie: session.cookie,
      json: {
        type: 'PERSON',
        name: 'Locatária Portal B1',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    expect(party.status).toBeLessThan(300);
    const access = await api<{ oneTimeToken: string }>('POST', '/portal/access', {
      cookie: session.cookie,
      json: { partyId: party.body.party.id, kind: 'TENANT' },
    });
    expect(access.status).toBe(201);
    const consumed = await page.request.post('/api/portal/auth/consume', {
      data: { token: access.body.oneTimeToken },
      headers: { origin: WEB },
    });
    expect(consumed.status()).toBe(200);

    await page.goto('/inquilino');
    await expect(page.getByRole('heading', { name: 'Portal do Locatário' })).toBeVisible({
      timeout: 60_000,
    });
    const logout = page.waitForResponse((res) => res.url().endsWith('/api/portal/auth/logout'), {
      timeout: 15_000,
    });
    await page
      .getByRole('button', { name: 'Sair' })
      .or(page.getByRole('link', { name: 'Sair' }))
      .click();
    expect((await logout).status()).toBe(200);
    await expect(page).toHaveURL(`${WEB}/`, { timeout: 30_000 });
    const portalCookie = (await page.context().cookies()).find((c) => c.name === 'aluguei_portal');
    expect(portalCookie, 'o navegador não pode manter o cookie do portal').toBeUndefined();
    await page.goto('/inquilino');
    await expect(page).toHaveURL(`${WEB}/`, { timeout: 60_000 });
  });
});
