import { expect, test } from '@playwright/test';
import {
  PLATFORM_ADMIN,
  preencherCadastroEmEtapas,
  submitRegistration,
  uniq,
} from './g2-b1-support';

/**
 * Admin da plataforma (decisão do usuário, 2026-09-15), pelo navegador: o cadastro
 * aberto fica em análise, o admin entra pela tela de login, aprova num plano,
 * suspende com motivo e cria um plano. Providers FAKE, nenhum efeito externo.
 */
test.describe('Admin da plataforma', () => {
  test('cadastro em análise, aprovação com plano, suspensão com motivo e novo plano', async ({
    page,
    browser,
  }) => {
    const id = uniq();
    const orgName = `Imobiliária Plataforma ${id}`;

    // 1. Cadastro aberto pela tela: fica em análise e o painel continua fechado.
    await page.goto('/register');
    await preencherCadastroEmEtapas(page, {
      nome: 'Dona da Imobiliária',
      email: `dona-${id}@teste.com`,
      senha: 'e2e-password-123',
      imobiliaria: orgName,
      documento: '11.222.333/0001-81',
      creci: 'J-12345',
      telefone: '(11) 98765-4321',
    });
    await submitRegistration(page);
    await expect(page).toHaveURL(/\/situacao-da-conta/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Cadastro em análise' })).toBeVisible();

    await page.goto('/app/properties');
    await expect(page).toHaveURL(/\/situacao-da-conta/);
    const denied = await page.goto('/plataforma');
    expect(denied?.status(), 'área da plataforma para quem não é admin').toBe(404);

    // 2. O admin entra pela tela de login e cai na plataforma, com a fila de análise.
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await admin.goto('/login');
    await admin.getByLabel('E-mail').fill(PLATFORM_ADMIN.email);
    await admin.getByLabel('Senha').fill(PLATFORM_ADMIN.password);
    await admin.getByRole('button', { name: 'Entrar' }).click();
    await expect(admin).toHaveURL(/\/plataforma$/, { timeout: 20_000 });
    await expect(admin.getByRole('heading', { name: 'Admin da plataforma' })).toBeVisible();
    await admin.getByRole('link', { name: orgName }).click();
    await expect(admin.getByRole('heading', { name: orgName })).toBeVisible();
    await expect(admin.getByText('11.222.333/0001-81')).toBeVisible();
    await expect(admin.getByText('(11) 98765-4321')).toBeVisible();

    // 3. Aprova no plano Profissional.
    await admin.getByRole('button', { name: 'Aprovar' }).click();
    const approveDialog = admin.getByRole('dialog');
    await approveDialog.getByLabel('Plano').selectOption({ label: 'Profissional (PROFISSIONAL)' });
    await approveDialog.getByRole('button', { name: 'Aprovar' }).click();
    await expect(admin.getByText('Imobiliária aprovada')).toBeVisible();
    await expect(admin.getByText('Plano Profissional')).toBeVisible();

    // 4. A dona entra no painel.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);

    // 5. Suspensão com motivo: a dona perde o painel e vê o motivo.
    await admin.getByRole('button', { name: 'Suspender' }).click();
    const suspendDialog = admin.getByRole('dialog');
    await suspendDialog.getByLabel('Motivo').pressSequentially('Documentação vencida');
    await suspendDialog.getByRole('button', { name: 'Suspender' }).click();
    await expect(admin.getByText('Imobiliária suspensa').first()).toBeVisible();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/situacao-da-conta/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Imobiliária suspensa' })).toBeVisible();
    await expect(page.getByText('Documentação vencida')).toBeVisible();

    // 6. Novo plano pela tela.
    const code = `E2E_${id.toUpperCase()}`;
    await admin.goto('/plataforma/planos');
    await admin.getByRole('button', { name: 'Novo plano' }).click();
    const planDialog = admin.getByRole('dialog');
    await planDialog.getByLabel('Código').fill(code);
    await planDialog.getByLabel('Nome', { exact: true }).fill(`Plano ${code}`);
    await planDialog.getByLabel('Imóveis', { exact: true }).fill('10');
    await planDialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(admin.getByText(code, { exact: true })).toBeVisible();

    await adminContext.close();
  });
});
