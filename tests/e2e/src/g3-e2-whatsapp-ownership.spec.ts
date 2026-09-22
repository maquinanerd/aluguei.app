import { expect, test } from '@playwright/test';
import { api, registerViaApi, useSession, watchPage } from './g2-b1-support';

/**
 * G3, trilha E2 (auditoria 2026-09-10, P1-18, segunda parte) pela interface: a tela de
 * integrações conectava o WhatsApp com "Conectar (teste)", que reivindicava o número
 * `fake-phone-1` sem token e sem prova de posse. Agora a imobiliária informa o ID do número e o
 * token da própria conta do WhatsApp Business, a conexão fica "Aguardando verificação" e só vira
 * "Verificada" quando o número é conferido com esse token. Verificador FAKE (META_MODE=dry_run):
 * o token `fake-wa-owner:<id>` é o dono do número; nenhuma chamada à Meta.
 */
test.use({ timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });

test.describe('G3 trilha E2 — posse do número do WhatsApp pela interface', () => {
  test('conectar, falhar a prova com o token errado, trocar o token e verificar', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const account = await registerViaApi('wa-posse');
    const phoneNumberId = `5${String(Date.now()).slice(-9)}`;

    await useSession(page, account.cookie);
    const watch = watchPage(page);
    watch.route = 'integrações';
    await page.goto('/app/admin/integrations', { timeout: 240_000 });

    // O botão antigo que reivindicava um número fixo sem token não existe mais.
    await page.getByRole('button', { name: 'Conectar número' }).click({ timeout: 60_000 });
    const connect = page.getByRole('dialog', { name: 'Conectar número do WhatsApp' });
    await expect(connect).toBeVisible();
    // Neste ambiente a verificação é FAKE, e a tela diz qual token é o dono do número.
    await expect(connect.getByText('Ambiente de teste')).toBeVisible();
    await connect.getByLabel('ID do número (phone_number_id)').fill(phoneNumberId);
    await connect.getByLabel('Token de acesso da conta').fill('fake-wa-owner:000000');
    await connect.getByRole('button', { name: 'Registrar número' }).click();
    await expect(page.getByText('Número registrado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Aguardando verificação')).toBeVisible();
    await expect(page.getByText('Ainda não recebe mensagens')).toBeVisible();

    // Token de outro número: a prova falha e a conexão continua pendente.
    await page.getByRole('button', { name: 'Verificar posse' }).click();
    await expect(page.getByText('Não foi possível comprovar a posse do número')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Aguardando verificação')).toBeVisible();

    // A imobiliária troca o token e verifica de novo.
    await page.getByRole('button', { name: 'Trocar token' }).click();
    const replace = page.getByRole('dialog', { name: 'Trocar token do número' });
    await expect(replace.getByLabel('ID do número (phone_number_id)')).toHaveValue(phoneNumberId);
    await replace.getByLabel('Token de acesso da conta').fill(`fake-wa-owner:${phoneNumberId}`);
    await replace.getByRole('button', { name: 'Salvar token' }).click();
    await expect(page.getByText('Token atualizado')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Verificar posse' }).click();
    await expect(page.getByText('Posse do número verificada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Verificada', { exact: true })).toBeVisible();
    await expect(page.getByText('Recebe mensagens')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verificar posse' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Trocar token' })).toBeHidden();

    const list = await api<{ connections: Array<{ phoneNumberId: string; status: string }> }>(
      'GET',
      '/whatsapp/connections',
      { cookie: account.cookie },
    );
    expect(list.body.connections).toEqual([
      expect.objectContaining({ phoneNumberId, status: 'VERIFIED' }),
    ]);
    // O token nunca volta para a tela.
    expect(JSON.stringify(list.body)).not.toContain('fake-wa-owner');

    // A única resposta de erro foi a verificação recusada (409), mostrada na tela.
    expect(watch.backendFailures).toHaveLength(1);
    expect(watch.backendFailures[0]).toContain('409 POST');
    expect(watch.backendFailures[0]).toContain('/verify');
    expect(watch.pageErrors).toEqual([]);
  });
});
