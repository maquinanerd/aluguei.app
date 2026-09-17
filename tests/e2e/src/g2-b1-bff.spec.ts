import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { api, createProperty, registerViaApi, useSession } from './g2-b1-support';
import type { Account } from './g2-b1-support';

/**
 * P1-02 (auditoria 2026-09-10): o BFF forçava `content-type: application/json`
 * (mutação sem corpo → 400) e convertia toda resposta em JSON (export CSV
 * chegava como `{}`).
 */
test.describe('P1-02: BFF repassa corpo e headers', () => {
  let account: Account;

  test.beforeAll(async () => {
    account = await registerViaApi('bff');
  });

  test('export CSV de leads chega como arquivo CSV', async ({ page }) => {
    test.setTimeout(240_000);
    const lead = await api<{ lead: { id: string } }>('POST', '/leads', {
      cookie: account.cookie,
      json: { source: 'E2E-CSV-B1' },
    });
    expect(lead.status).toBe(201);
    await useSession(page, account.cookie);

    const direct = await page.request.get(
      '/api/backend/reporting/export/leads?format=csv&maxRows=10',
    );
    expect(direct.status()).toBe(200);
    expect(direct.headers()['content-type']).toContain('text/csv');
    expect(direct.headers()['content-disposition']).toContain('leads.csv');
    expect((await direct.text()).split('\n')[0]).toBe('id,status,channel,source,createdAt');

    await page.goto('/app/reporting');
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Exportar' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('leads.csv');
    const content = await readFile(await download.path(), 'utf8');
    expect(content.split('\n')[0]).toBe('id,status,channel,source,createdAt');
    expect(content).toContain(lead.body.lead.id);
  });

  test('mutação sem corpo pela tela: remover característica do imóvel', async ({ page }) => {
    test.setTimeout(240_000);
    const propertyId = await createProperty(account.cookie, 'Imóvel característica B1');
    const added = await api('POST', `/properties/${propertyId}/features`, {
      cookie: account.cookie,
      json: { feature: 'varanda' },
    });
    expect(added.status).toBeLessThan(300);
    await useSession(page, account.cookie);

    await page.goto(`/app/properties/${propertyId}`);
    await page.getByRole('tab', { name: 'Dados' }).click();
    const removal = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/backend/properties/${propertyId}/features/`) &&
        res.request().method() === 'DELETE',
    );
    await page
      .locator('.peg-tag', { hasText: 'varanda' })
      .getByRole('button', { name: 'Remover' })
      .click();
    expect((await removal).status()).toBeLessThan(300);

    const detail = await api<{ property: { features: string[] } }>(
      'GET',
      `/properties/${propertyId}`,
      { cookie: account.cookie },
    );
    expect(detail.body.property.features).not.toContain('varanda');
  });
});
