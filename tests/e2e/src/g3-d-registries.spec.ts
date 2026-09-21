import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { api, DAY_MS, registerViaApi, uniq, useSession, watchPage, WEB } from './g2-b1-support';
import type { Account } from './g2-b1-support';
import { pickComboboxOption } from './g2-b2-support';
import { brDate } from './g3-c-support';
import { addMember, outboxToken, spDatePlus } from './g3-d-support';
import type { IdBody } from './g3-d-support';

/**
 * G3, trilha D (auditoria 2026-09-10): cadastros e identidade pela interface — pessoa com detalhe,
 * edição, documentos e arquivamento (P2-01); ciclo da visita e da proposta (P2-02); detalhe e
 * edição do lead com responsável (P2-03); troca de senha, recuperação na tela de login e convite
 * de membro por e-mail (P2-04). Nada é enviado: as mensagens ficam na caixa de saída local.
 */
test.use({ timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });

const FIRST_LOAD = { timeout: 240_000 };

async function open(page: Page, account: Account, path: string): Promise<void> {
  await useSession(page, account.cookie);
  await page.goto(path, FIRST_LOAD);
}

test.describe('G3 trilha D — cadastros pela interface', () => {
  test('pessoa: CPF inválido recusado na tela, detalhe, edição, documentos e arquivamento', async ({
    page,
  }) => {
    test.setTimeout(400_000);
    const owner = await registerViaApi('d-pessoa');
    const watch = watchPage(page);
    watch.route = 'contatos';
    await open(page, owner, '/app/crm/contacts');

    await page.getByRole('button', { name: 'Novo contato' }).first().click();
    const create = page.getByRole('dialog', { name: 'Novo contato' });
    const name = `Pessoa D ${uniq()}`;
    await create.getByLabel('Nome').fill(name);
    await create.getByLabel('Tipo de identificador').selectOption('CPF');
    await create.getByLabel('Valor').fill('123.456.789-00');
    await create.getByRole('button', { name: 'Salvar contato' }).click();
    await expect(create.getByText('CPF inválido: confira os dígitos')).toBeVisible();
    const none = await api<{ parties: IdBody[] }>('GET', '/parties?limit=100', {
      cookie: owner.cookie,
    });
    expect(none.body.parties, 'nada foi gravado com o CPF inválido').toEqual([]);

    await create.getByLabel('Valor').fill('529.982.247-25');
    await create.getByRole('button', { name: 'Salvar contato' }).click();
    await expect(page.getByText('Contato criado')).toBeVisible({ timeout: 30_000 });

    await page.getByText(name).click();
    await expect(page).toHaveURL(/\/app\/crm\/contacts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    watch.route = 'contato';
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('529.982.247-25')).toBeVisible();

    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Editar contato' });
    const renamed = `${name} Silva`;
    await edit.getByLabel('Nome', { exact: true }).fill(renamed);
    await edit.getByLabel('Locatário').check();
    await edit.getByRole('button', { name: 'Adicionar identificador' }).click();
    await edit.getByLabel('Tipo do identificador 2').selectOption('PHONE');
    await edit.getByLabel('Valor do identificador 2').fill('(11) 98888-7777');
    await edit.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Contato atualizado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: renamed, level: 1 })).toBeVisible();
    await expect(page.getByText('(11) 98888-7777')).toBeVisible();
    await expect(page.getByText('Locatário', { exact: true })).toBeVisible();

    // Documentos: sem storage na stack de E2E, a tela mostra o erro da API em vez de fingir.
    await page.getByRole('tab', { name: 'Documentos' }).click();
    await expect(page.getByText('Nenhum documento')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar documento' }).first().click();
    const upload = page.getByRole('dialog', { name: 'Enviar documento' });
    await upload.getByLabel('Tipo de documento').selectOption('PROOF_OF_INCOME');
    await upload.getByLabel('Arquivo').setInputFiles({
      name: 'renda.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 teste'),
    });
    await upload.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(upload.getByText('Storage não configurado')).toBeVisible({ timeout: 30_000 });
    await upload.getByRole('button', { name: 'Cancelar', exact: true }).click();

    await page.getByRole('button', { name: 'Arquivar', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Arquivar contato?' });
    await confirm.getByRole('button', { name: 'Arquivar', exact: true }).click();
    await expect(page.getByText('Contato arquivado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Reativar', exact: true })).toBeVisible();

    const list = await api<{ parties: Array<{ name: string }> }>('GET', '/parties?limit=100', {
      cookie: owner.cookie,
    });
    expect(list.body.parties.map((p) => p.name)).not.toContain(renamed);
    expect(watch.backendFailures.filter((f) => !f.includes('/documents/upload-url'))).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('visita: confirma, reagenda e cancela com motivo', async ({ page }) => {
    test.setTimeout(300_000);
    const owner = await registerViaApi('d-visita');
    const created = await api<{ visit: IdBody }>('POST', '/visits', {
      cookie: owner.cookie,
      json: { scheduledAt: new Date(Date.now() + 2 * DAY_MS).toISOString(), note: 'visita D' },
    });
    expect(created.status).toBe(201);
    const watch = watchPage(page);
    watch.route = 'visitas';
    await open(page, owner, '/app/visits');

    await page.getByRole('row').filter({ hasText: 'Agendada' }).first().click();
    const drawer = page.getByRole('dialog', { name: 'Detalhe da visita' });
    await drawer.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByText('Visita confirmada')).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText('Confirmada', { exact: true })).toBeVisible();

    const newDay = spDatePlus(5);
    await drawer.getByRole('button', { name: 'Reagendar', exact: true }).click();
    const reschedule = page.getByRole('dialog', { name: 'Reagendar visita' });
    await reschedule.getByLabel('Nova data e hora').fill(`${newDay}T14:30`);
    await reschedule.getByRole('button', { name: 'Reagendar', exact: true }).click();
    await expect(page.getByText('Visita reagendada')).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText('Agendada', { exact: true })).toBeVisible();
    await expect(drawer.getByText(`${brDate(newDay)}, 14:30`)).toBeVisible();

    await drawer.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const cancel = page.getByRole('dialog', { name: 'Cancelar visita' });
    await cancel.getByRole('button', { name: 'Cancelar visita', exact: true }).click();
    await expect(cancel.getByText('Informe o motivo')).toBeVisible();
    await cancel.getByLabel('Motivo').fill('Interessado desistiu');
    await cancel.getByRole('button', { name: 'Cancelar visita', exact: true }).click();
    await expect(page.getByText('Visita cancelada')).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText('Cancelada', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Interessado desistiu')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);

    const visit = await api<{ visit: Record<string, unknown> }>(
      'GET',
      `/visits/${created.body.visit.id}`,
      { cookie: owner.cookie },
    );
    expect(visit.body.visit).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Interessado desistiu',
    });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('proposta: validade em data civil, edição no rascunho, envio e recusa com motivo', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const owner = await registerViaApi('d-proposta');
    const title = `Apto proposta ${uniq()}`;
    const property = await api<{ property: IdBody }>('POST', '/properties', {
      cookie: owner.cookie,
      json: { title, propertyType: 'APARTMENT' },
    });
    expect(property.status).toBe(201);
    const watch = watchPage(page);
    watch.route = 'propostas';
    await open(page, owner, '/app/proposals');

    const validUntil = spDatePlus(10);
    await page.getByRole('button', { name: 'Nova proposta' }).first().click();
    const create = page.getByRole('dialog', { name: 'Nova proposta' });
    await pickComboboxOption(create, 'Imóvel', title.slice(0, 12), title);
    await create.getByLabel('Aluguel mensal (R$)').fill('3.500,00');
    await create.getByLabel('Válida até').fill(validUntil);
    await create.getByRole('button', { name: 'Criar' }).click();
    await expect(page.getByText('Proposta criada')).toBeVisible({ timeout: 30_000 });

    const listed = await api<{ proposals: Array<{ id: string; validUntil: string | null }> }>(
      'GET',
      '/proposals?limit=100',
      { cookie: owner.cookie },
    );
    const [proposal] = listed.body.proposals;
    // A data digitada é a data gravada: sem virar instante UTC e sem voltar um dia.
    expect(proposal?.validUntil).toBe(validUntil);

    await page.getByRole('row').filter({ hasText: 'Rascunho' }).first().click();
    const drawer = page.getByRole('dialog', { name: 'Detalhe da proposta' });
    await expect(drawer.getByText(brDate(validUntil))).toBeVisible();
    await drawer.getByRole('button', { name: 'Editar', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Editar proposta' });
    await edit.getByLabel('Aluguel mensal (R$)').fill('3.200,00');
    await edit.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Proposta atualizada')).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText('R$ 3.200,00/mês')).toBeVisible();

    await drawer.getByRole('button', { name: 'Enviar', exact: true }).click();
    const send = page.getByRole('dialog', { name: 'Enviar proposta' });
    await expect(send.getByLabel('Validade')).toHaveValue(validUntil);
    await send.getByRole('button', { name: 'Enviar proposta', exact: true }).click();
    await expect(page.getByText('Proposta enviada')).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText('Enviada', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);

    await drawer.getByRole('button', { name: 'Recusar', exact: true }).click();
    const reject = page.getByRole('dialog', { name: 'Recusar proposta' });
    await reject.getByRole('button', { name: 'Recusar proposta', exact: true }).click();
    await expect(reject.getByText('Informe o motivo')).toBeVisible();
    await reject.getByLabel('Motivo').fill('Valor acima do orçamento');
    await reject.getByRole('button', { name: 'Recusar proposta', exact: true }).click();
    await expect(page.getByText('Proposta recusada')).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText('Recusada', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Valor acima do orçamento')).toBeVisible();

    const after = await api<{ proposal: Record<string, unknown> }>(
      'GET',
      `/proposals/${proposal?.id ?? ''}`,
      { cookie: owner.cookie },
    );
    expect(after.body.proposal).toMatchObject({
      status: 'REJECTED',
      monthlyRentCents: 320_000,
      validUntil,
      decisionReason: 'Valor acima do orçamento',
    });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('lead: detalhe pela rota própria e edição de dados e responsável', async ({ page }) => {
    test.setTimeout(300_000);
    const owner = await registerViaApi('d-lead');
    const colleague = await registerViaApi('d-colega');
    const colleagueId = await addMember(owner, colleague, 'agent');
    const lead = await api<{ lead: IdBody }>('POST', '/leads', {
      cookie: owner.cookie,
      json: { source: 'site', notes: 'Procura 2 quartos' },
    });
    expect(lead.status).toBe(201);
    const watch = watchPage(page);
    watch.route = 'lead';
    await open(page, owner, `/app/crm/leads/${lead.body.lead.id}`);
    await expect(page.getByText('Procura 2 quartos')).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'Editar lead' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar lead' });
    await edit.getByLabel('Responsável').selectOption(colleagueId);
    await edit.getByLabel('Canal').fill('WHATSAPP');
    await edit.getByLabel('Orçamento máximo (R$)').fill('4.000,00');
    await edit.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Lead atualizado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Corretor d-colega').first()).toBeVisible();

    const detail = await api<{ lead: Record<string, unknown> }>(
      'GET',
      `/leads/${lead.body.lead.id}`,
      { cookie: owner.cookie },
    );
    expect(detail.body.lead).toMatchObject({
      ownerUserId: colleagueId,
      channel: 'WHATSAPP',
      budgetMaxCents: 400_000,
      status: 'NEW',
    });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });
});

test.describe('G3 trilha D — identidade pela interface', () => {
  test('convite de membro por e-mail: registrado na caixa de saída e aceito pela tela', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const owner = await registerViaApi('d-equipe');
    const watch = watchPage(page);
    watch.route = 'equipe';
    await open(page, owner, '/app/admin/members');
    const email = `convidado-${uniq()}@teste.com`;

    await page.getByRole('button', { name: 'Convidar membro' }).first().click();
    const invite = page.getByRole('dialog', { name: 'Convidar membro' });
    await invite.getByLabel('E-mail').fill(email);
    await invite.getByLabel('Função').selectOption('agent');
    await invite.getByRole('button', { name: 'Registrar convite' }).click();
    await expect(page.getByText('Convite registrado')).toBeVisible({ timeout: 30_000 });
    const invites = page.locator('section.peg-card', {
      has: page.getByRole('heading', { name: 'Convites' }),
    });
    await expect(invites.getByText(email)).toBeVisible();
    await expect(invites.getByText('Pendente')).toBeVisible();
    const outbox = page.locator('section.peg-card', {
      has: page.getByRole('heading', { name: 'Caixa de saída' }),
    });
    await expect(outbox.getByText('nenhum e-mail é enviado')).toBeVisible();
    await expect(outbox.getByText(email)).toBeVisible();

    const token = await outboxToken(email, 'MEMBER_INVITE');
    const guest = await browser.newContext({
      baseURL: WEB,
      timezoneId: 'America/Sao_Paulo',
      locale: 'pt-BR',
    });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/convite?token=${token}`, FIRST_LOAD);
    await expect(guestPage.getByRole('heading', { name: 'Convite para a equipe' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(guestPage.getByText('Corretor', { exact: true })).toBeVisible();
    await guestPage.getByLabel('Seu nome').fill('Pessoa Convidada');
    await guestPage.getByLabel('Senha', { exact: true }).fill('senha-do-convidado-1');
    await guestPage.getByLabel('Confirme a senha').fill('senha-do-convidado-1');
    await guestPage.getByRole('button', { name: 'Aceitar convite' }).click();
    await expect(guestPage).toHaveURL(/\/app(\/|$)/, { timeout: 120_000 });
    await guest.close();

    const members = await api<{ members: Array<{ email: string; role: string }> }>(
      'GET',
      `/organizations/${owner.orgId}/members`,
      { cookie: owner.cookie },
    );
    expect(members.body.members).toContainEqual(expect.objectContaining({ email, role: 'agent' }));
    await page.reload();
    await expect(invites.getByText('Aceito')).toBeVisible({ timeout: 60_000 });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('troca de senha na conta encerra as outras sessões', async ({ page }) => {
    test.setTimeout(300_000);
    const account = await registerViaApi('d-senha');
    const other = await api('POST', '/auth/login', {
      json: { email: account.email, password: account.password },
    });
    expect(other.status).toBe(200);
    const watch = watchPage(page);
    watch.route = 'configurações';
    await open(page, account, '/app/settings');

    const card = page.locator('section.peg-card', {
      has: page.getByRole('heading', { name: 'Trocar senha' }),
    });
    await card.getByLabel('Senha atual').fill('senha-errada-000');
    await card.getByLabel('Nova senha', { exact: true }).fill('senha-nova-e2e-456');
    await card.getByLabel('Confirme a nova senha').fill('senha-nova-e2e-456');
    await card.getByRole('button', { name: 'Trocar senha' }).click();
    await expect(card.getByText('Senha atual incorreta')).toBeVisible({ timeout: 30_000 });

    await card.getByLabel('Senha atual').fill(account.password);
    await card.getByRole('button', { name: 'Trocar senha' }).click();
    await expect(page.getByText('Senha alterada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('1 outra sessão encerrada')).toBeVisible();

    const oldLogin = await api('POST', '/auth/login', {
      json: { email: account.email, password: account.password },
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api('POST', '/auth/login', {
      json: { email: account.email, password: 'senha-nova-e2e-456' },
    });
    expect(newLogin.status).toBe(200);
    expect(watch.pageErrors).toEqual([]);
  });

  test('recuperação de senha pela tela de login, com o link da caixa de saída', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const account = await registerViaApi('d-recupera');
    await page.goto('/login', FIRST_LOAD);
    await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Recuperar senha' })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByLabel('E-mail').fill(account.email);
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(
      page.getByText('Se houver uma conta com este e-mail, registramos um link'),
    ).toBeVisible({ timeout: 30_000 });

    const token = await outboxToken(account.email, 'PASSWORD_RESET');
    await page.goto(`/redefinir-senha?token=${token}`, FIRST_LOAD);
    await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByLabel('Nova senha', { exact: true }).fill('curta');
    await page.getByLabel('Confirme a nova senha').fill('curta');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByText('A senha precisa ter de 8 a 128 caracteres')).toBeVisible();
    await page.getByLabel('Nova senha', { exact: true }).fill('senha-recuperada-e2e');
    await page.getByLabel('Confirme a nova senha').fill('senha-recuperada-e2e');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByText('Senha redefinida')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('link', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 60_000 });
    await page.getByLabel('E-mail').fill(account.email);
    await page.getByLabel('Senha').fill('senha-recuperada-e2e');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/app(\/|$)/, { timeout: 120_000 });

    // O link é de uso único.
    const reused = await api('POST', '/auth/reset-password', {
      json: { token, newPassword: 'outra-senha-e2e-1' },
    });
    expect(reused.status).toBe(404);
  });
});
