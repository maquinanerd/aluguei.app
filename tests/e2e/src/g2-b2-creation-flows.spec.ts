import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { api, poll, registerViaApi, uniq, useSession, watchPage } from './g2-b1-support';
import {
  nextMonthStart,
  pickComboboxOption,
  seedApprovedApplication,
  seedApprovedTemplate,
  seedLease,
  seedParty,
  seedReadyProperty,
  VALID_CPFS,
} from './g2-b2-support';

/**
 * Critério do G2 (plano de continuação, Fase 4): Playwright dos fluxos de criação e
 * das ações essenciais pela tela — anúncio, proposta, vistoria e contrato; gerar e
 * enviar contrato; cancelar cobrança. Cada teste confere o resultado na API.
 */

test.describe('Fluxos de criação pela interface', () => {
  test('cria anúncio, proposta e vistoria pelos modais', async ({ page }) => {
    test.setTimeout(400_000);
    const { cookie } = await registerViaApi('criacao');
    const id = uniq();
    const propertyTitle = `Imóvel Criação ${id}`;
    const propertyId = await seedReadyProperty(cookie, propertyTitle);
    await useSession(page, cookie);
    const watch = watchPage(page);

    watch.route = 'anúncios';
    await page.goto('/app/listings', { timeout: 240_000 });
    await page.getByRole('button', { name: 'Novo listing' }).first().click();
    const listingDialog = page.getByRole('dialog', { name: 'Novo listing' });
    await pickComboboxOption(listingDialog, 'Imóvel', 'Imóvel Criação', propertyTitle);
    await listingDialog.getByLabel('Título do anúncio').fill(`Anúncio Criação ${id}`);
    await listingDialog.getByRole('button', { name: 'Criar' }).click();
    await expect(page.getByText('Listing criado')).toBeVisible({ timeout: 30_000 });
    const listings = await api<{ listings: Array<{ title: string; propertyId: string }> }>(
      'GET',
      '/listings?limit=50',
      { cookie },
    );
    expect(listings.body.listings).toEqual([
      expect.objectContaining({ title: `Anúncio Criação ${id}`, propertyId }),
    ]);

    watch.route = 'propostas';
    await page.goto('/app/proposals', { timeout: 240_000 });
    await page.getByRole('button', { name: 'Nova proposta' }).first().click();
    const proposalDialog = page.getByRole('dialog', { name: 'Nova proposta' });
    await pickComboboxOption(proposalDialog, 'Imóvel', 'Imóvel Criação', propertyTitle);
    await proposalDialog.getByLabel('Aluguel mensal (R$)').pressSequentially('2.400,00');
    await proposalDialog.getByRole('button', { name: 'Criar' }).click();
    await expect(page.getByText('Proposta criada')).toBeVisible({ timeout: 30_000 });
    const proposals = await api<{
      proposals: Array<{ monthlyRentCents: number; propertyId: string }>;
    }>('GET', '/proposals?limit=50', { cookie });
    expect(proposals.body.proposals).toEqual([
      expect.objectContaining({ monthlyRentCents: 240_000, propertyId }),
    ]);

    watch.route = 'vistorias';
    await page.goto('/app/inspections', { timeout: 240_000 });
    await page.getByRole('button', { name: 'Nova vistoria' }).first().click();
    const inspectionDialog = page.getByRole('dialog', { name: 'Nova vistoria' });
    await pickComboboxOption(inspectionDialog, 'Imóvel', 'Imóvel Criação', propertyTitle);
    await inspectionDialog.getByRole('button', { name: 'Criar' }).click();
    await expect(page.getByText('Vistoria criada')).toBeVisible({ timeout: 30_000 });
    const inspections = await api<{ inspections: Array<{ propertyId: string }> }>(
      'GET',
      '/inspections?limit=50',
      { cookie },
    );
    expect(inspections.body.inspections).toEqual([expect.objectContaining({ propertyId })]);

    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('cria o contrato de uma candidatura aprovada, gera o texto e envia para assinatura', async ({
    page,
  }) => {
    test.setTimeout(400_000);
    const { cookie } = await registerViaApi('contrato');
    const id = uniq();
    const propertyId = await seedReadyProperty(cookie, `Imóvel Contrato ${id}`);
    const tenantName = `Locatária Contrato ${id}`;
    const tenantId = await seedParty(cookie, tenantName, VALID_CPFS[0]);
    const applicationId = await seedApprovedApplication(cookie, propertyId, tenantId);
    const templateName = `Template Contrato ${id}`;
    await seedApprovedTemplate(cookie, templateName);

    await useSession(page, cookie);
    const watch = watchPage(page);
    watch.route = 'contratos';
    await page.goto('/app/contracts', { timeout: 240_000 });
    await page.getByRole('button', { name: 'Novo contrato' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Novo contrato' });
    const applicationSelect = dialog.getByLabel('Aplicação aprovada', { exact: true });
    await expect(applicationSelect.locator('option', { hasText: tenantName })).toBeAttached({
      timeout: 30_000,
    });
    await applicationSelect.selectOption({
      label: await optionLabel(applicationSelect, tenantName),
    });
    await dialog.getByLabel('Template', { exact: true }).selectOption({ label: templateName });
    await dialog.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(/\/app\/contracts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const contractId = page.url().split('/').pop() ?? '';

    await page.getByRole('button', { name: 'Gerar contrato' }).click();
    await expect(page.getByText('Contrato gerado')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Enviar para assinatura' }).click();
    await poll(
      () => api<{ contract: { status: string } }>('GET', `/contracts/${contractId}`, { cookie }),
      (res) => res.body.contract.status === 'SENT_FOR_SIGNATURE',
      'o contrato deve ir para assinatura pela tela',
    );
    const contract = await api<{ contract: { applicationId: string; status: string } }>(
      'GET',
      `/contracts/${contractId}`,
      { cookie },
    );
    expect(contract.body.contract).toMatchObject({ applicationId, status: 'SENT_FOR_SIGNATURE' });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  // A cobrança nasce agendada. As ações da linha abrem só o próprio diálogo: o clique
  // não pode chegar à linha e abrir o detalhe por cima (o painel lateral cobria a
  // confirmação e ninguém conseguia confirmar).
  test('cancela uma cobrança pela tela', async ({ page }) => {
    test.setTimeout(400_000);
    const seed = await seedLease('cobranca');
    const charge = await api<{ charge: { id: string } }>('POST', '/charges', {
      cookie: seed.cookie,
      json: { leaseId: seed.leaseId, periodStart: nextMonthStart() },
    });
    expect(charge.status).toBe(201);
    const chargeId = charge.body.charge.id;

    await useSession(page, seed.cookie);
    const watch = watchPage(page);
    watch.route = 'cobranças';
    await page.goto('/app/charges', { timeout: 240_000 });
    const detail = page.getByRole('dialog', { name: 'Detalhe da cobrança' });

    // A linha carregada (a tabela mostra linhas de carregamento antes dos dados).
    await page
      .locator('tbody tr', { hasText: 'Agendada' })
      .first()
      .click({ position: { x: 16, y: 16 } });
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();

    const receive = page.getByRole('button', { name: 'Receber' }).first();
    await expect(receive).toBeVisible();
    await receive.click();
    const payment = page.getByRole('dialog', { name: /^Receber R\$/ });
    await expect(payment).toBeVisible();
    await expect(detail).toBeHidden();
    await payment.getByRole('button', { name: 'Cancelar' }).click();
    await expect(payment).toBeHidden();

    await page.getByRole('button', { name: 'Cancelar' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Cancelar cobrança' });
    await expect(dialog).toBeVisible();
    await expect(detail).toBeHidden();
    await dialog.getByRole('button', { name: 'Cancelar cobrança' }).click();
    await poll(
      () =>
        api<{ charge: { status: string } }>('GET', `/charges/${chargeId}`, { cookie: seed.cookie }),
      (res) => res.body.charge.status === 'CANCELLED',
      'a cobrança deve ser cancelada pela tela',
    );
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });
});

async function optionLabel(select: Locator, contains: string): Promise<string> {
  const text = await select.locator('option', { hasText: contains }).first().textContent();
  return (text ?? '').trim();
}
