import { expect, test } from '@playwright/test';
import { api, createProperty, registerViaApi, useSession } from './g2-b1-support';

/**
 * P1-04 (auditoria 2026-09-10): o detalhe de vistoria quebrava sempre — hook
 * chamado depois de um return condicional ("Rendered more hooks than during the
 * previous render"). O código foi corrigido na Fase 0 (commit 5def4aa); este é
 * o aceite pela UI.
 */
test('P1-04: detalhe de vistoria abre e navega pelas abas sem pageerror', async ({ page }) => {
  test.setTimeout(240_000);
  const account = await registerViaApi('vistoria');
  const propertyId = await createProperty(account.cookie, 'Imóvel Vistoria B1');
  const created = await api<{ inspection: { id: string } }>('POST', '/inspections', {
    cookie: account.cookie,
    json: { propertyId, type: 'CHECKIN' },
  });
  expect(created.status).toBe(201);
  await useSession(page, account.cookie);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  await page.goto(`/app/inspections/${created.body.inspection.id}`);
  const summaryTab = page.getByRole('tab', { name: 'Resumo' });
  // Se a página quebrar, a falha traz a mensagem do erro, não só a aba ausente.
  await expect
    .poll(
      async () => {
        if (pageErrors.length > 0) {
          return `pageerror: ${pageErrors.join(' | ')}`;
        }
        return (await summaryTab.isVisible()) ? 'aba Resumo visível' : 'carregando';
      },
      { timeout: 60_000, message: 'o detalhe de vistoria deve renderizar sem erro de página' },
    )
    .toBe('aba Resumo visível');
  for (const tab of ['Ambientes', 'Ocorrências', 'Revisão IA', 'Relatório', 'Resumo']) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
  }

  // Dados novos forçam novo render — era nele que a contagem de hooks mudava.
  await page.getByRole('tab', { name: 'Ambientes' }).click();
  await page.getByPlaceholder('Nome do ambiente (ex.: Sala)').fill('Sala B1');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Sala B1', { exact: true })).toBeVisible({ timeout: 30_000 });

  expect(pageErrors).toEqual([]);
});
