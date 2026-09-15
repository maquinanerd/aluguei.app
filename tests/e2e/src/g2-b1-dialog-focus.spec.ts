import { expect, test } from '@playwright/test';
import { api, poll, registerViaApi, uniq, useSession } from './g2-b1-support';

/**
 * Foco dentro de Modal e Drawer do design system (revisão final da Track B1 do
 * G2). O efeito que leva o foco para o diálogo dependia de `onClose`, e as
 * telas passam uma função nova a cada render: cada tecla num campo controlado
 * re-executava o efeito — o foco saía do campo, voltava ao botão que abriu o
 * diálogo e ia para "Fechar"; o espaço seguinte fechava o diálogo. Os textos
 * são digitados tecla a tecla (`pressSequentially`), como uma pessoa digita;
 * `fill` troca o valor de uma vez e escondia o defeito.
 */

interface IdBody {
  id: string;
}

interface ApplicationBody {
  application: {
    status: string;
    decisionReason: string | null;
    decisionSource: string | null;
    decidedBy: string | null;
  };
}

/** CPF válido com score FAKE 418 (abaixo de 700): o worker leva a candidatura a MANUAL_REVIEW. */
const MANUAL_REVIEW_CPF = '24681357928';

async function seedManualReview(): Promise<{ cookie: string; applicationId: string }> {
  const { cookie } = await registerViaApi('foco');
  const property = await api<{ property: IdBody }>('POST', '/properties', {
    cookie,
    json: { title: 'Imóvel Foco B1', propertyType: 'APARTMENT' },
  });
  expect(property.status).toBe(201);
  const propertyId = property.body.property.id;
  const terms = await api('PUT', `/properties/${propertyId}/financial-terms`, {
    cookie,
    json: { monthlyRentCents: 250_000 },
  });
  expect(terms.status).toBe(200);

  const tenant = await api<{ party: IdBody }>('POST', '/parties', {
    cookie,
    json: {
      type: 'PERSON',
      name: 'Locatária Foco B1',
      identities: [{ kind: 'CPF', value: MANUAL_REVIEW_CPF }],
    },
  });
  expect(tenant.status).toBe(201);
  const partyId = tenant.body.party.id;
  const consent = await api('POST', `/parties/${partyId}/consents`, {
    cookie,
    json: { purpose: 'CREDIT_SCREENING' },
  });
  expect(consent.status).toBe(201);

  const application = await api<{ application: IdBody }>('POST', '/rental-applications', {
    cookie,
    json: { partyId, propertyId },
  });
  expect(application.status).toBe(201);
  const applicationId = application.body.application.id;
  const submitted = await api('PATCH', `/rental-applications/${applicationId}/status`, {
    cookie,
    json: { status: 'SUBMITTED' },
  });
  expect(submitted.status).toBeLessThan(300);
  const screening = await api('POST', `/rental-applications/${applicationId}/screening`, {
    cookie,
    json: { provider: 'FAKE' },
  });
  expect([200, 201, 202]).toContain(screening.status);
  await poll(
    () => api<ApplicationBody>('GET', `/rental-applications/${applicationId}`, { cookie }),
    (res) => res.body.application.status === 'MANUAL_REVIEW',
    'screening FAKE com score abaixo de 700 deve deixar a candidatura em MANUAL_REVIEW',
  );
  return { cookie, applicationId };
}

test.describe('Foco em Modal e Drawer ao digitar tecla a tecla', () => {
  test('motivo da decisão de crédito fica no campo, Tab circula no diálogo e o motivo é gravado', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const seed = await seedManualReview();
    await useSession(page, seed.cookie);
    await page.goto(`/app/screening/${seed.applicationId}`, { timeout: 240_000 });

    // Escape fecha e devolve o foco ao botão que abriu o diálogo.
    const approve = page.getByRole('button', { name: 'Aprovar', exact: true });
    await approve.click();
    const approveDialog = page.getByRole('dialog', { name: 'Aprovar crédito' });
    const draft = approveDialog.getByLabel('Motivo da decisão');
    await draft.pressSequentially('Rascunho', { delay: 30 });
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue('Rascunho');
    await page.keyboard.press('Escape');
    await expect(approveDialog).toBeHidden();
    await expect(approve).toBeFocused();

    await page.getByRole('button', { name: 'Rejeitar', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Rejeitar crédito' });
    const reasonField = dialog.getByLabel('Motivo da decisão');
    const reason = 'Renda declarada abaixo de 3 vezes o aluguel e sem fiador';
    await reasonField.pressSequentially(reason, { delay: 20 });
    await expect(dialog).toBeVisible();
    await expect(reasonField).toBeFocused();
    await expect(reasonField).toHaveValue(reason);

    // Depois das re-renderizações, Tab e Shift+Tab continuam presos no diálogo.
    const cancel = dialog.getByRole('button', { name: 'Cancelar', exact: true });
    const submit = dialog.getByRole('button', { name: 'Rejeitar', exact: true });
    const close = dialog.getByRole('button', { name: 'Fechar', exact: true });
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(submit).toBeFocused();

    await submit.click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const persisted = await api<ApplicationBody>(
      'GET',
      `/rental-applications/${seed.applicationId}`,
      { cookie: seed.cookie },
    );
    expect(persisted.status).toBe(200);
    expect(persisted.body.application.status).toBe('REJECTED');
    expect(persisted.body.application.decisionReason).toBe(reason);
    expect(persisted.body.application.decisionSource).toBe('MANUAL');
    expect(persisted.body.application.decidedBy).not.toBeNull();
    await expect(page.getByText(reason)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Manual (equipe)')).toBeVisible();
  });

  test('nome e identificador digitados em "Novo contato" ficam nos campos e o contato é criado', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { cookie } = await registerViaApi('foco-contato');
    await useSession(page, cookie);
    await page.goto('/app/crm/contacts', { timeout: 240_000 });

    await page.getByRole('button', { name: 'Novo contato' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Novo contato' });
    const name = 'Contato Foco B1';
    const nameField = dialog.getByLabel('Nome');
    await nameField.pressSequentially(name, { delay: 20 });
    await expect(dialog).toBeVisible();
    await expect(nameField).toBeFocused();
    await expect(nameField).toHaveValue(name);

    const email = `contato-foco-${uniq()}@teste.com`;
    const emailField = dialog.getByLabel('Valor');
    await emailField.pressSequentially(email, { delay: 10 });
    await expect(emailField).toBeFocused();
    await expect(emailField).toHaveValue(email);

    await dialog.getByRole('button', { name: 'Salvar contato' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const parties = await api<{ parties: Array<{ name: string }> }>('GET', '/parties?limit=100', {
      cookie,
    });
    expect(parties.status).toBe(200);
    expect(parties.body.parties.map((p) => p.name)).toContain(name);
  });

  test('campo controlado no Drawer mantém o foco e Escape devolve o foco ao gatilho', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/dev/calibration', { timeout: 240_000 });

    const trigger = page.getByRole('button', { name: 'Abrir drawer' });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Inspector contextual' });
    const field = drawer.getByLabel('Próxima ação');
    const text = 'Ligar para o lead amanhã cedo';
    await field.pressSequentially(text, { delay: 20 });
    await expect(drawer).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(text);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
