import { expect, test } from '@playwright/test';
import { api, createProperty, registerViaApi, useSession } from './g2-b1-support';
import type { Account } from './g2-b1-support';

/**
 * P0-07 (auditoria 2026-09-10): "3.500" — o próprio placeholder do campo — era
 * gravado como 350 centavos (R$ 3,50) e alimentava locação e cobranças.
 * O valor é digitado pela UI e conferido no que a API persistiu.
 */
test.describe('P0-07: valor monetário digitado em pt-BR', () => {
  let account: Account;

  test.beforeAll(async () => {
    account = await registerViaApi('money');
  });

  test('"3.500" nos termos financeiros do imóvel grava R$ 3.500,00', async ({ page }) => {
    test.setTimeout(240_000);
    const propertyId = await createProperty(account.cookie, 'Imóvel MoneyInput B1');
    await useSession(page, account.cookie);

    await page.goto(`/app/properties/${propertyId}`);
    await page.getByRole('button', { name: 'Termos financeiros', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Termos financeiros' });
    await dialog.getByLabel('Aluguel mensal (R$)').fill('3.500');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const persisted = await api<{
      property: { financialTerms: { monthlyRentCents: number } | null };
    }>('GET', `/properties/${propertyId}`, { cookie: account.cookie });
    expect(persisted.status).toBe(200);
    expect(persisted.body.property.financialTerms?.monthlyRentCents).toBe(350_000);

    await page.getByRole('tab', { name: 'Financeiro' }).click();
    await expect(page.getByText(/R\$\s3\.500,00/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('"3.500,50" no orçamento mínimo de um lead novo grava 350050 centavos', async ({ page }) => {
    test.setTimeout(240_000);
    await useSession(page, account.cookie);

    await page.goto('/app/crm/leads');
    await page.getByRole('button', { name: 'Novo lead' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo lead' });
    await dialog.getByLabel('Fonte').fill('E2E orçamento B1');
    await dialog.getByLabel('Orçamento mínimo (R$)').fill('3.500,50');
    await dialog.getByRole('button', { name: 'Criar lead' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const leads = await api<{
      leads: Array<{ source: string | null; budgetMinCents: number | null }>;
    }>('GET', '/leads?limit=50', { cookie: account.cookie });
    const lead = leads.body.leads.find((l) => l.source === 'E2E orçamento B1');
    expect(lead, 'o lead criado pela UI deve existir').toBeTruthy();
    expect(lead?.budgetMinCents).toBe(350_050);
  });
});
