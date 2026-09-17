import { expect, test } from '@playwright/test';
import { api, poll, registerViaApi, uniq, useSession, watchPage } from './g2-b1-support';
import {
  pickComboboxOption,
  seedParty,
  seedPublishedListing,
  seedReadyProperty,
  VALID_CPFS,
} from './g2-b2-support';

/**
 * P1-17 parcial (auditoria 2026-09-10): fluxos essenciais sem interface — criar a
 * candidatura (com o consentimento LGPD que o screening exige), fazer a primeira
 * publicação de um anúncio em canal e arquivar um imóvel (o botão "Remover" chamava
 * uma rota DELETE que a API não tem).
 */

test('P1-17: nova candidatura pela tela, com consentimento LGPD, entra em análise', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const { cookie } = await registerViaApi('candidatura');
  const id = uniq();
  const propertyTitle = `Imóvel Candidatura ${id}`;
  const tenantName = `Solicitante Candidatura ${id}`;
  const propertyId = await seedReadyProperty(cookie, propertyTitle);
  const tenantId = await seedParty(cookie, tenantName, VALID_CPFS[2]);

  await useSession(page, cookie);
  const watch = watchPage(page);
  watch.route = 'crédito';
  await page.goto('/app/screening', { timeout: 240_000 });
  await page.getByRole('button', { name: 'Nova candidatura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova candidatura' });
  await pickComboboxOption(dialog, 'Solicitante', 'Solicitante Candidatura', tenantName);
  await pickComboboxOption(dialog, 'Imóvel', 'Imóvel Candidatura', propertyTitle);

  const submit = dialog.getByRole('button', { name: 'Criar e enviar para análise' });
  await submit.click();
  await expect(
    dialog.getByText('A análise de crédito exige a autorização da pessoa (LGPD)'),
  ).toBeVisible();
  await dialog.getByLabel('A pessoa autorizou a consulta de crédito (LGPD)').check();
  await submit.click();

  await expect(page).toHaveURL(/\/app\/screening\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const applicationId = page.url().split('/').pop() ?? '';
  const application = await api<{
    application: { status: string; partyId: string; propertyId: string };
  }>('GET', `/rental-applications/${applicationId}`, { cookie });
  expect(application.body.application).toMatchObject({
    status: 'SUBMITTED',
    partyId: tenantId,
    propertyId,
  });
  const consents = await api<{ consents: Array<{ purpose: string; revokedAt: string | null }> }>(
    'GET',
    `/parties/${tenantId}/consents`,
    { cookie },
  );
  expect(consents.body.consents).toEqual([
    expect.objectContaining({ purpose: 'CREDIT_SCREENING', revokedAt: null }),
  ]);
  await expect(page.getByRole('button', { name: 'Solicitar análise' })).toBeVisible();
  expect(watch.backendFailures).toEqual([]);
  expect(watch.pageErrors).toEqual([]);
});

test('P1-17: primeira publicação de um anúncio em canal pela tela', async ({ page }) => {
  test.setTimeout(300_000);
  const { cookie } = await registerViaApi('canal');
  const id = uniq();
  const title = `Anúncio Canal ${id}`;
  const propertyId = await seedReadyProperty(cookie, `Imóvel Canal ${id}`);
  const listingId = await seedPublishedListing(cookie, propertyId, title);

  await useSession(page, cookie);
  const watch = watchPage(page);
  watch.route = 'canais';
  await page.goto('/app/channels', { timeout: 240_000 });
  await page.getByRole('button', { name: 'Publicar anúncio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publicar anúncio em canal' });
  await dialog.getByLabel('Anúncio', { exact: true }).selectOption({ label: title });
  const channel = dialog.getByLabel('Canal', { exact: true });
  await expect(channel.locator('option', { hasText: 'OLX (sem integração)' })).toBeDisabled();
  await channel.selectOption({ label: 'Portal de teste (FAKE)' });
  await dialog.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Publicação enviada ao canal')).toBeVisible({ timeout: 30_000 });

  await poll(
    () =>
      api<{ channels: Array<{ channel: string; status: string }> }>(
        'GET',
        `/listings/${listingId}/channels`,
        { cookie },
      ),
    (res) => res.body.channels.some((p) => p.channel === 'fake' && p.status === 'PUBLISHED'),
    'o worker deve publicar no canal FAKE',
  );
  await page.reload();
  await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });
  expect(watch.backendFailures).toEqual([]);
  expect(watch.pageErrors).toEqual([]);
});

test('P1-17: "Arquivar imóvel" arquiva pela API e pode ser desfeito', async ({ page }) => {
  test.setTimeout(300_000);
  const { cookie } = await registerViaApi('arquivar');
  const id = uniq();
  const title = `Imóvel Arquivar ${id}`;
  const propertyId = await seedReadyProperty(cookie, title);

  await useSession(page, cookie);
  const watch = watchPage(page);
  watch.route = 'detalhe do imóvel';
  await page.goto(`/app/properties/${propertyId}`, { timeout: 240_000 });
  await page.getByRole('button', { name: 'Arquivar imóvel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Arquivar imóvel' });
  await dialog.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByText('Imóvel arquivado')).toBeVisible({ timeout: 30_000 });

  const archived = await api<{ property: { status: string } }>('GET', `/properties/${propertyId}`, {
    cookie,
  });
  expect(archived.body.property.status).toBe('ARCHIVED');

  await page.getByRole('button', { name: 'Reativar imóvel' }).click();
  await expect(page.getByText('Imóvel reativado')).toBeVisible({ timeout: 30_000 });
  const active = await api<{ property: { status: string } }>('GET', `/properties/${propertyId}`, {
    cookie,
  });
  expect(active.body.property.status).toBe('ACTIVE');
  expect(watch.backendFailures).toEqual([]);
  expect(watch.pageErrors).toEqual([]);
});
