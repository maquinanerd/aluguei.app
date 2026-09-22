import { expect, test } from '@playwright/test';
import {
  api,
  createProperty,
  poll,
  registerViaApi,
  uniq,
  useSession,
  watchPage,
  WEB,
} from './g2-b1-support';
import { nextMonthStart, seedLease } from './g2-b2-support';

/**
 * G3, trilha E (auditoria 2026-09-10) pela interface: a caixa de entrada devolve a conversa ao
 * atendimento automático (P1-18), a vistoria concluída não oferece mais mudança de evidência
 * (P1-24) e o extrato do portal do inquilino não soma cobrança cancelada (P2-05).
 */
test.use({ timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });

test.describe('G3 trilha E — portal, caixa de entrada e vistoria pela interface', () => {
  test('P1-18: a equipe devolve a conversa ao atendimento automático', async ({ page }) => {
    test.setTimeout(300_000);
    const account = await registerViaApi('handoff');
    const phoneNumberId = `8${String(Date.now()).slice(-9)}`;
    // Desde a trilha E2 (P1-18) o número só recebe webhook depois da prova de posse: a conexão
    // leva o token da conta (o FAKE aceita `fake-wa-owner:<id>`) e é verificada.
    const connection = await api<{ connection: { id: string } }>('POST', '/whatsapp/connections', {
      cookie: account.cookie,
      json: { phoneNumberId, accessToken: `fake-wa-owner:${phoneNumberId}` },
    });
    expect(connection.status, 'conexão do WhatsApp').toBe(201);
    const verified = await api(
      'POST',
      `/whatsapp/connections/${connection.body.connection.id}/verify`,
      {
        cookie: account.cookie,
        json: {},
      },
    );
    expect(verified.status, 'posse do número verificada').toBe(200);
    const from = '5511977776666';
    const webhook = await api('POST', '/webhooks/whatsapp', {
      json: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: phoneNumberId },
                  contacts: [{ wa_id: from }],
                  messages: [
                    {
                      from,
                      id: `wamid.e2e-${uniq()}`,
                      timestamp: String(Date.now()),
                      type: 'text',
                      text: { body: 'quero falar com um atendente' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    expect(webhook.status).toBe(200);
    await poll(
      () =>
        api<{ conversations: Array<{ status: string }> }>('GET', '/conversations?limit=10', {
          cookie: account.cookie,
        }),
      (res) => res.body.conversations.some((c) => c.status === 'NEEDS_HUMAN'),
      'o worker deve registrar a conversa em atendimento humano',
    );

    await useSession(page, account.cookie);
    const watch = watchPage(page);
    watch.route = 'caixa de entrada';
    await page.goto('/app/inbox', { timeout: 240_000 });
    await page
      .getByRole('button', { name: /Precisa de humano/ })
      .first()
      .click();
    const resume = page.getByRole('button', { name: 'Devolver ao atendimento automático' });
    await expect(resume).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Passar para a equipe' })).toBeHidden();
    await resume.click();
    await expect(page.getByText('Conversa devolvida ao atendimento automático')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Passar para a equipe' })).toBeVisible({
      timeout: 30_000,
    });
    const after = await api<{ conversations: Array<{ status: string }> }>(
      'GET',
      '/conversations?limit=10',
      { cookie: account.cookie },
    );
    expect(after.body.conversations.map((c) => c.status)).toEqual(['ACTIVE']);
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('P1-24: vistoria concluída não oferece ambiente, ocorrência nem sugestão', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const account = await registerViaApi('vistoria-fechada');
    const propertyId = await createProperty(account.cookie, `Imóvel vistoria fechada ${uniq()}`);
    const create = async (): Promise<string> => {
      const res = await api<{ inspection: { id: string } }>('POST', '/inspections', {
        cookie: account.cookie,
        json: { propertyId, type: 'CHECKIN' },
      });
      expect(res.status).toBe(201);
      return res.body.inspection.id;
    };
    const walk = async (id: string, statuses: string[]): Promise<void> => {
      for (const status of statuses) {
        const res = await api('PATCH', `/inspections/${id}/status`, {
          cookie: account.cookie,
          json: { status },
        });
        expect(res.status, `vistoria → ${status}`).toBe(200);
      }
    };
    const open = await create();
    await walk(open, ['CAPTURING', 'PROCESSING', 'REVIEW']);
    const closed = await create();
    await walk(closed, ['CAPTURING', 'PROCESSING', 'REVIEW', 'COMPLETED']);

    await useSession(page, account.cookie);
    const watch = watchPage(page);
    watch.route = 'vistoria';

    // Em revisão, a tela ainda oferece: o teste não passa por ausência de botão.
    await page.goto(`/app/inspections/${open}`, { timeout: 240_000 });
    await page.getByRole('tab', { name: 'Ambientes' }).click();
    await expect(page.getByRole('button', { name: 'Adicionar' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('tab', { name: 'Ocorrências' }).click();
    await expect(page.getByRole('button', { name: 'Nova ocorrência' })).toBeVisible();

    await page.goto(`/app/inspections/${closed}`, { timeout: 240_000 });
    await page.getByRole('tab', { name: 'Ambientes' }).click();
    const note = 'Vistoria concluída: a evidência está fechada e não pode mais ser alterada.';
    await expect(page.getByText(note)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Adicionar' })).toBeHidden();
    await page.getByRole('tab', { name: 'Ocorrências' }).click();
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova ocorrência' })).toBeHidden();
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('P2-05: extrato do portal do inquilino não soma cobrança cancelada', async ({ browser }) => {
    test.setTimeout(400_000);
    const seed = await seedLease('extrato');
    const issue = async (periodStart: string): Promise<string> => {
      const res = await api<{ charge: { id: string } }>('POST', '/charges', {
        cookie: seed.cookie,
        json: { leaseId: seed.leaseId, periodStart },
      });
      expect(res.status).toBe(201);
      return res.body.charge.id;
    };
    const next = nextMonthStart();
    await issue(next);
    const later = new Date(`${next}T00:00:00.000Z`);
    later.setUTCMonth(later.getUTCMonth() + 1);
    const cancelledId = await issue(later.toISOString().slice(0, 10));
    const cancel = await api('POST', `/charges/${cancelledId}/cancel`, {
      cookie: seed.cookie,
      json: {},
    });
    expect(cancel.status).toBe(200);

    const access = await api<{ oneTimeToken: string }>('POST', '/portal/access', {
      cookie: seed.cookie,
      json: { partyId: seed.tenantId, kind: 'TENANT' },
    });
    expect(access.status).toBe(201);
    const tenantContext = await browser.newContext({
      timezoneId: 'America/Sao_Paulo',
      locale: 'pt-BR',
    });
    const tenant = await tenantContext.newPage();
    const watch = watchPage(tenant);
    watch.route = 'portal do inquilino';
    await tenant.goto(`${WEB}/portal/entrar?token=${access.body.oneTimeToken}`, {
      timeout: 240_000,
    });
    await expect(tenant).toHaveURL(/\/inquilino/, { timeout: 60_000 });
    const billed = tenant.locator('section.peg-card', {
      has: tenant.getByRole('heading', { name: 'Total cobrado' }),
    });
    // Aluguel de R$ 2.500,00: só a cobrança que vale; a cancelada fica fora da soma.
    await expect(billed.getByText('R$ 2.500,00')).toBeVisible({ timeout: 60_000 });
    await expect(billed.getByText('R$ 5.000,00')).toBeHidden();
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
    await tenantContext.close();
  });
});
