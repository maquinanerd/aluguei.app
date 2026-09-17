import { expect, test } from '@playwright/test';
import { api, useSession, watchPage, WEB } from './g2-b1-support';
import { seedLease } from './g2-b2-support';
import type { LeaseSeed } from './g2-b2-support';

/**
 * P1-16 (auditoria 2026-09-10): os portais do inquilino e do proprietário existiam
 * na API, mas eram inalcançáveis pela interface — ninguém gerava o link, e a rota
 * de consumo do token não tinha chamador. P1-03 no portal: "Sair" não encerrava a
 * sessão no servidor.
 */
test.describe('P1-16: portal alcançável pela interface', () => {
  let seed: LeaseSeed;

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    seed = await seedLease('portal');
  });

  test('gera o link do inquilino na locação, entra pelo link, o link não abre de novo e "Sair" encerra a sessão', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    await useSession(page, seed.cookie);
    const watch = watchPage(page);
    watch.route = 'locação';
    await page.goto(`/app/leases/${seed.leaseId}`, { timeout: 240_000 });

    await page.getByRole('button', { name: `Acesso ao portal de ${seed.tenantName}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Acesso ao portal' });
    await expect(dialog.getByText(seed.tenantName)).toBeVisible();
    await dialog.getByRole('button', { name: 'Gerar link de acesso' }).click();
    const linkField = dialog.getByRole('textbox', { name: 'Link de acesso' });
    await expect(linkField).toBeVisible({ timeout: 30_000 });
    const link = await linkField.inputValue();
    expect(link.startsWith(`${WEB}/portal/entrar?token=`)).toBe(true);
    await expect(dialog.getByRole('img', { name: 'QR code do link de acesso' })).toBeVisible();

    const tenantContext = await browser.newContext();
    const tenant = await tenantContext.newPage();
    await tenant.goto(link, { timeout: 240_000 });
    await expect(tenant).toHaveURL(/\/inquilino/, { timeout: 60_000 });
    await expect(tenant.getByText(seed.tenantName).first()).toBeVisible();
    const portalCookie = (await tenantContext.cookies()).find((c) => c.name === 'aluguei_portal');
    expect(portalCookie, 'o link deve abrir uma sessão do portal').toBeTruthy();

    const secondContext = await browser.newContext();
    const second = await secondContext.newPage();
    await second.goto(link, { timeout: 240_000 });
    await expect(
      second.getByText('Este link de acesso é inválido, expirou ou já foi usado'),
    ).toBeVisible({
      timeout: 60_000,
    });
    await secondContext.close();

    await tenant.getByRole('button', { name: 'Sair' }).click();
    await expect(tenant).toHaveURL(`${WEB}/`, { timeout: 60_000 });
    const reused = await api('GET', '/portal/me', {
      cookie: `aluguei_portal=${portalCookie?.value ?? ''}`,
    });
    expect(reused.status, 'cookie copiado antes do "Sair" não vale mais').toBe(401);
    await tenantContext.close();

    // O painel mostra o acesso com o link usado e permite revogar.
    await page.reload();
    await page.getByRole('button', { name: `Acesso ao portal de ${seed.tenantName}` }).click();
    await expect(dialog.getByText('Link já usado')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Revogar acesso' }).click();
    await expect(dialog.getByText('Acesso revogado')).toBeVisible({ timeout: 30_000 });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('o proprietário também recebe link e entra no portal do proprietário', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    await useSession(page, seed.cookie);
    await page.goto(`/app/leases/${seed.leaseId}`, { timeout: 240_000 });
    await page.getByRole('button', { name: `Acesso ao portal de ${seed.landlordName}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Acesso ao portal' });
    await dialog.getByRole('button', { name: 'Gerar link de acesso' }).click();
    const link = await dialog.getByRole('textbox', { name: 'Link de acesso' }).inputValue();

    const landlordContext = await browser.newContext();
    const landlord = await landlordContext.newPage();
    await landlord.goto(link, { timeout: 240_000 });
    await expect(landlord).toHaveURL(/\/proprietario/, { timeout: 60_000 });
    await expect(landlord.getByText(seed.landlordName).first()).toBeVisible();
    await landlordContext.close();
  });
});
