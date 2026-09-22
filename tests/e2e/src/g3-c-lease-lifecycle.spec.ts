import { expect, test } from '@playwright/test';
import { api, poll, registerViaApi, uniq, useSession, watchPage } from './g2-b1-support';
import {
  pickComboboxOption,
  seedLease,
  seedParty,
  seedReadyProperty,
  VALID_CPFS,
} from './g2-b2-support';
import { brDate, card, lastDayOf, seedCoOwnedLease, spMonth, spToday } from './g3-c-support';

/**
 * G3, trilha C (auditoria 2026-09-10): encargos por atraso configuráveis e vencimento no dia da
 * locação (P1-07), repasse entre coproprietários (P1-08) e renovação, reajuste e encerramento da
 * locação (P1-20), pela interface. O navegador fica no fuso de São Paulo: data civil não pode
 * aparecer um dia antes.
 */
test.use({ timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });

test.describe('G3 trilha C — locação pela interface', () => {
  test('encargos e vencimento, coproprietários e cobrança no dia configurado', async ({ page }) => {
    test.setTimeout(400_000);
    const seed = await seedCoOwnedLease('encargos');
    await useSession(page, seed.cookie);
    const watch = watchPage(page);
    watch.route = 'locação';
    await page.goto(`/app/leases/${seed.leaseId}`, { timeout: 240_000 });

    const owners = card(page, 'Proprietários');
    await expect(owners.getByText(seed.majorityName)).toBeVisible({ timeout: 60_000 });
    await expect(owners.getByText('60%')).toBeVisible();
    await expect(owners.getByText(seed.minorityName)).toBeVisible();
    await expect(owners.getByText('40%')).toBeVisible();
    await expect(
      owners.getByRole('button', { name: `Acesso ao portal de ${seed.minorityName}` }),
    ).toBeVisible();

    const terms = card(page, 'Encargos e vencimento');
    await expect(terms.getByText('Multa por atraso')).toBeVisible();
    await expect(terms.getByText('2%', { exact: true })).toBeVisible();
    await expect(terms.getByText('1% ao mês', { exact: true })).toBeVisible();
    await expect(terms.getByText('Dia 10', { exact: true })).toBeVisible();

    await terms.getByRole('button', { name: 'Editar encargos' }).click();
    const dialog = page.getByRole('dialog', { name: 'Encargos e vencimento' });
    await dialog.getByLabel('Multa por atraso (%)').fill('12');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialog.getByText('A multa fica entre 0% e 10%.')).toBeVisible();
    await dialog.getByLabel('Multa por atraso (%)').fill('2,5');
    await dialog.getByLabel('Juros de mora (% ao mês)').fill('0,5');
    await dialog.getByLabel('Dia de vencimento').fill('5');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Encargos atualizados')).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toBeHidden();
    await expect(terms.getByText('2,5%', { exact: true })).toBeVisible();
    await expect(terms.getByText('0,5% ao mês', { exact: true })).toBeVisible();
    await expect(terms.getByText('Dia 5', { exact: true })).toBeVisible();

    const lease = await api<{ lease: Record<string, unknown> }>('GET', `/leases/${seed.leaseId}`, {
      cookie: seed.cookie,
    });
    expect(lease.body.lease).toMatchObject({ lateFeeBps: 250, interestMonthlyBps: 50, dueDay: 5 });

    // Cobrança do mês corrente: vence no dia 5, mostrado como data civil (sem voltar um dia).
    await page.getByRole('button', { name: 'Gerar cobrança' }).click();
    await expect(page.getByText('Cobrança criada')).toBeVisible({ timeout: 30_000 });
    await expect(
      card(page, 'Cobranças').getByText(`venc. ${brDate(`${spMonth(0)}-05`)}`),
    ).toBeVisible({
      timeout: 30_000,
    });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('reajusta, renova e encerra a locação, com histórico e cobrança cancelada', async ({
    page,
  }) => {
    test.setTimeout(400_000);
    const seed = await seedLease('ciclo');
    const nextMonth = spMonth(1);
    const later = await api<{ charge: { id: string } }>('POST', '/charges', {
      cookie: seed.cookie,
      json: { leaseId: seed.leaseId, periodStart: `${spMonth(3)}-01` },
    });
    expect(later.status).toBe(201);

    await useSession(page, seed.cookie);
    const watch = watchPage(page);
    watch.route = 'locação';
    await page.goto(`/app/leases/${seed.leaseId}`, { timeout: 240_000 });
    const history = card(page, 'Histórico da locação');
    await expect(history.getByText('Sem renovações, reajustes ou encerramento.')).toBeVisible({
      timeout: 60_000,
    });

    // Reajuste por índice a partir do mês que vem: R$ 2.500,00 + 4,52% = R$ 2.613,00.
    await page.getByRole('button', { name: 'Reajustar' }).click();
    const readjust = page.getByRole('dialog', { name: 'Reajustar aluguel' });
    await readjust.getByLabel('A partir de').fill(nextMonth);
    await readjust.getByLabel('Índice', { exact: true }).selectOption('IPCA');
    await readjust.getByLabel('Variação (%)').fill('4,52');
    await expect(readjust.getByText('Novo aluguel: R$ 2.613,00')).toBeVisible();
    await readjust.getByRole('button', { name: 'Reajustar' }).click();
    await expect(page.getByText('Reajuste registrado')).toBeVisible({ timeout: 30_000 });
    const monthLabel = `${nextMonth.slice(5, 7)}/${nextMonth.slice(0, 4)}`;
    await expect(history.getByText('Reajuste', { exact: true })).toBeVisible();
    await expect(
      history.getByText(`Aluguel: R$ 2.500,00 → R$ 2.613,00 a partir de ${monthLabel}`),
    ).toBeVisible();
    await expect(history.getByText('Índice: IPCA (+4,52%)')).toBeVisible();

    // Renovação: novo término, sem aluguel novo.
    const renewedEnd = `${String(Number(spToday().slice(0, 4)) + 3)}-12-31`;
    await page.getByRole('button', { name: 'Renovar' }).click();
    const renew = page.getByRole('dialog', { name: 'Renovar locação' });
    await renew.getByLabel('Novo término').fill(renewedEnd);
    await renew.getByRole('button', { name: 'Renovar' }).click();
    await expect(page.getByText('Locação renovada')).toBeVisible({ timeout: 30_000 });
    await expect(history.getByText(`Término: sem data → ${brDate(renewedEnd)}`)).toBeVisible();
    await expect(page.getByText(`${brDate(spToday())} → ${brDate(renewedEnd)}`)).toBeVisible();

    // Encerramento no fim do mês que vem: fica em encerramento e a cobrança de depois sai.
    const endDate = lastDayOf(nextMonth);
    await page.getByRole('button', { name: 'Encerrar' }).click();
    const end = page.getByRole('dialog', { name: 'Encerrar locação' });
    await end.getByLabel('Data de término').fill(endDate);
    await end.getByLabel('Motivo').fill('Acordo entre as partes');
    await expect(
      end.getByText(`A locação fica em encerramento até ${brDate(endDate)}`, { exact: false }),
    ).toBeVisible();
    await end.getByRole('button', { name: 'Encerrar locação' }).click();
    await expect(page.getByText('Encerramento registrado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Encerrando', { exact: true }).first()).toBeVisible();
    await expect(history.getByText('Motivo: Acordo entre as partes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renovar' })).toBeHidden();
    await expect(card(page, 'Cobranças').getByText('Cancelada')).toBeVisible();

    const charge = await api<{ charge: { status: string } }>(
      'GET',
      `/charges/${later.body.charge.id}`,
      { cookie: seed.cookie },
    );
    expect(charge.body.charge.status).toBe('CANCELLED');
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('cadastra a participação dos proprietários no imóvel', async ({ page }) => {
    test.setTimeout(300_000);
    const { cookie } = await registerViaApi('participacao');
    const id = uniq();
    const propertyId = await seedReadyProperty(cookie, `Imóvel participação ${id}`);
    const first = `Primeira Dona ${id}`;
    const second = `Segundo Dono ${id}`;
    await seedParty(cookie, first, VALID_CPFS[1]);
    await seedParty(cookie, second, VALID_CPFS[2]);

    await useSession(page, cookie);
    const watch = watchPage(page);
    watch.route = 'imóvel';
    await page.goto(`/app/properties/${propertyId}`, { timeout: 240_000 });
    await page.getByRole('tab', { name: 'Proprietários' }).click();
    const owners = card(page, 'Proprietários');
    await expect(
      owners.getByText('Sem proprietário vinculado, a locação deste imóvel fica sem repasse.'),
    ).toBeVisible({ timeout: 60_000 });

    const add = page.getByRole('dialog', { name: 'Adicionar proprietário' });
    await owners.getByRole('button', { name: 'Adicionar proprietário' }).click();
    await pickComboboxOption(add, 'Pessoa', 'Primeira', first);
    await add.getByLabel('Participação (%)').fill('60');
    await add.getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByText('Proprietário adicionado')).toBeVisible({ timeout: 30_000 });
    await expect(owners.getByText(first)).toBeVisible();
    await expect(
      owners.getByText('As participações somam 60%; para criar a locação, precisam somar 100%.'),
    ).toBeVisible();

    await owners.getByRole('button', { name: 'Adicionar proprietário' }).click();
    await pickComboboxOption(add, 'Pessoa', 'Segundo', second);
    await add.getByLabel('Participação (%)').fill('50');
    await add.getByRole('button', { name: 'Adicionar' }).click();
    await expect(add.getByText('As participações somariam 110%, acima de 100%.')).toBeVisible();
    await add.getByLabel('Participação (%)').fill('40');
    await add.getByRole('button', { name: 'Adicionar' }).click();
    await expect(add).toBeHidden({ timeout: 30_000 });
    await expect(owners.getByText(second)).toBeVisible();
    await expect(owners.getByText('40%')).toBeVisible();
    await expect(owners.getByText(/As participações somam/)).toBeHidden();

    await owners.getByRole('button', { name: `Remover ${second}` }).click();
    const confirm = page.getByRole('dialog', { name: 'Remover proprietário' });
    await confirm.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByText('Proprietário removido')).toBeVisible({ timeout: 30_000 });
    await expect(owners.getByText(second)).toBeHidden();

    const property = await api<{
      property: { owners: Array<{ name: string; ownershipSharePct: number | null }> };
    }>('GET', `/properties/${propertyId}`, { cookie });
    expect(property.body.property.owners).toEqual([
      expect.objectContaining({ name: first, ownershipSharePct: 60 }),
    ]);
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('nova cobrança pela lista vence no dia da locação, sem data escolhida', async ({ page }) => {
    test.setTimeout(400_000);
    const seed = await seedLease('lista');
    await useSession(page, seed.cookie);
    const watch = watchPage(page);
    watch.route = 'cobranças';
    await page.goto('/app/charges', { timeout: 240_000 });

    await page.getByRole('button', { name: 'Nova cobrança' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nova cobrança' });
    const leaseSelect = dialog.getByLabel('Locação', { exact: true });
    await expect(leaseSelect.locator(`option[value="${seed.leaseId}"]`)).toBeAttached({
      timeout: 30_000,
    });
    await leaseSelect.selectOption(seed.leaseId);
    await dialog.getByLabel('Mês de referência').fill(spMonth(1));
    await expect(dialog.getByText('Sem data, vence no dia configurado na locação.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Criar' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    await poll(
      () =>
        api<{ charges: Array<{ dueDate: string; periodStart: string }> }>(
          'GET',
          `/charges?leaseId=${seed.leaseId}`,
          { cookie: seed.cookie },
        ),
      (res) => res.body.charges.length === 1,
      'a cobrança criada pela lista deve existir',
    );
    const listed = await api<{ charges: Array<{ dueDate: string; periodStart: string }> }>(
      'GET',
      `/charges?leaseId=${seed.leaseId}`,
      { cookie: seed.cookie },
    );
    expect(listed.body.charges[0]).toMatchObject({
      periodStart: `${spMonth(1)}-01`,
      dueDate: `${spMonth(1)}-10`,
    });
    // A cobrança já existe na API: se a linha não aparecer, a mensagem traz o que a tela recebeu.
    await expect(
      page.locator('tbody tr', { hasText: brDate(`${spMonth(1)}-10`) }),
      `linha da cobrança na lista; falhas do backend: ${JSON.stringify(watch.backendFailures)}; erros da página: ${JSON.stringify(watch.pageErrors)}`,
    ).toBeVisible({ timeout: 30_000 });
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });
});
