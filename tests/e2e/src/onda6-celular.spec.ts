import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { api, platformAdminSession, registerViaApi, useSession } from './g2-b1-support';

/**
 * Onda 6 — versões de celular da gestão (Visão Geral e negociação).
 *
 * O quadro de negociações nasceu com cinco colunas de 240px numa faixa de
 * rolagem horizontal. Em 1440 isso cabe; em 390 o usuário arrasta a faixa
 * inteira — inclusive as colunas vazias — para descobrir onde está cada
 * negociação. O spec mede o que dá para medir sem olho humano:
 *
 * 1. **A página não rola de lado.** Rolagem horizontal da página inteira em
 *    celular esconde conteúdo à direita e quebra o gesto de voltar.
 * 2. **Alvos de toque ≥ 44px** nos controles principais (critério 3 do prompt).
 * 3. **As duas telas abrem sem erro de página** em 390 e em 1440.
 *
 * As imagens ficam em `docs/audits/<data>/evidence/front/onda6/`.
 */

const CELULAR = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const EVIDENCIA = '../../docs/audits/2026-09-29/evidence/front/onda6';

interface Semeado {
  cookie: string;
}

async function semear(): Promise<Semeado> {
  const { cookie, orgId } = await registerViaApi('onda6');

  // Vendas é módulo de plano: sem um plano que o inclua, a API responde 403 e o
  // quadro nasce vazio — o que não mede nada sobre celular.
  const admin = await platformAdminSession();
  const planos = await api<{ plans: Array<{ id: string; code: string }> }>(
    'GET',
    '/platform/plans',
    { cookie: admin },
  );
  expect(planos.status, 'planos da plataforma').toBe(200);
  const ilimitado = planos.body.plans.find((plano) => plano.code === 'ILIMITADO');
  expect(ilimitado, 'plano com o módulo VENDAS').toBeTruthy();
  const trocaDePlano = await api('PUT', `/platform/organizations/${orgId}/plan`, {
    cookie: admin,
    json: { planId: ilimitado?.id },
  });
  expect(trocaDePlano.status, 'plano da imobiliária').toBe(200);

  const negociacoes: Array<{
    titulo: string;
    comprador: string;
    cpf: string;
    valor: number;
    etapa?: string;
  }> = [
    {
      titulo: 'Cobertura · Marista',
      comprador: 'Otávio Prado',
      cpf: '52998224725',
      valor: 139_000_000,
    },
    {
      titulo: 'Kitnet · Universitário',
      comprador: 'Paula Nunes',
      cpf: '11144477735',
      valor: 20_500_000,
    },
    {
      titulo: 'Casa · Jardim Goiás',
      comprador: 'Luana Castro',
      cpf: '12345678909',
      valor: 89_000_000,
      etapa: 'DOCUMENTATION',
    },
  ];

  for (const item of negociacoes) {
    const imovel = await api<{ property: { id: string } }>('POST', '/properties', {
      cookie,
      json: { title: item.titulo, propertyType: 'APARTMENT' },
    });
    expect(imovel.status, `imóvel ${item.titulo}`).toBe(201);

    const comprador = await api<{ party: { id: string } }>('POST', '/parties', {
      cookie,
      json: {
        type: 'PERSON',
        name: item.comprador,
        identities: [{ kind: 'CPF', value: item.cpf }],
      },
    });
    expect(comprador.status, `comprador ${item.comprador}`).toBe(201);

    const negociacao = await api<{ negotiation: { id: string } }>('POST', '/sale-negotiations', {
      cookie,
      json: {
        propertyId: imovel.body.property.id,
        buyerPartyId: comprador.body.party.id,
        askingPriceCents: item.valor,
        offerAmountCents: item.valor - 500_000,
        commissionBps: 500,
      },
    });
    expect(negociacao.status, `negociação ${item.titulo}`).toBe(201);

    if (item.etapa !== undefined) {
      const movida = await api(
        'POST',
        `/sale-negotiations/${negociacao.body.negotiation.id}/stage`,
        {
          cookie,
          json: { stage: item.etapa },
        },
      );
      expect(movida.status, `etapa ${item.etapa}`).toBe(200);
    }
  }

  return { cookie };
}

/**
 * Largura do documento além da janela = a página rola de lado. O tsconfig do
 * E2E não carrega a lib DOM (ela conflita com os tipos de `fetch` do Node, que
 * os outros specs usam), então o corpo que roda no navegador declara o pouco
 * que usa.
 */
interface ElementoComRolagem {
  scrollWidth: number;
  clientWidth: number;
}

async function sobraHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raiz = (globalThis as unknown as { document: { documentElement: ElementoComRolagem } })
      .document.documentElement;
    return raiz.scrollWidth - raiz.clientWidth;
  });
}

test.describe('Onda 6 — gestão no celular', () => {
  test('Visão Geral e negociações em 390 e 1440', async ({ page }) => {
    const { cookie } = await semear();
    await useSession(page, cookie);

    const erros: string[] = [];
    page.on('pageerror', (err) => erros.push(err.message));

    for (const [nome, tamanho] of [
      ['celular', CELULAR],
      ['desktop', DESKTOP],
    ] as const) {
      await page.setViewportSize(tamanho);

      await page.goto('/app');
      // A saudação segue o horário de São Paulo (tela 32): "Bom dia", "Boa tarde" ou "Boa noite".
      await expect(
        page.getByRole('heading', { level: 1, name: /^(bom dia|boa tarde|boa noite),/i }),
      ).toBeVisible();
      await page.screenshot({ path: `${EVIDENCIA}/visao-geral-${nome}.png`, fullPage: true });
      expect(
        await sobraHorizontal(page),
        `Visão Geral rola de lado em ${nome}`,
      ).toBeLessThanOrEqual(1);

      await page.goto('/app/vendas/negociacoes');
      await expect(page.getByText('Cobertura · Marista').first()).toBeVisible();
      await page.screenshot({ path: `${EVIDENCIA}/negociacoes-${nome}.png`, fullPage: true });
      expect(
        await sobraHorizontal(page),
        `Negociações rola de lado em ${nome}`,
      ).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize(CELULAR);
    await page.goto('/app/vendas/negociacoes');
    await expect(page.getByText('Cobertura · Marista').first()).toBeVisible();

    // O quadro empilha: coluna estreita em faixa que rola de lado obriga a
    // arrastar cinco etapas — inclusive as vazias — para achar uma negociação.
    // Coluna na largura do quadro é a prova de que não sobrou faixa para arrastar.
    const quadro = page.locator('.sale-board');
    const larguraDoQuadro = (await quadro.boundingBox())?.width ?? 0;
    const larguraDaColuna =
      (await page.locator('.sale-board__col').first().boundingBox())?.width ?? 0;
    expect(larguraDaColuna, 'coluna ocupa a largura toda no celular').toBeGreaterThan(
      larguraDoQuadro - 2,
    );

    // A barra superior cabe: o menu da conta vinha cortado na borda direita,
    // porque trilha, imobiliária e relógio disputavam a mesma linha.
    const conta = await page.getByRole('button', { name: 'Menu da conta' }).boundingBox();
    expect(
      (conta?.x ?? 0) + (conta?.width ?? 0),
      'menu da conta dentro da tela',
    ).toBeLessThanOrEqual(CELULAR.width);

    // Alvo de toque de 44px nos botões da barra superior (critério 3).
    const menu = await page.getByRole('button', { name: 'Abrir menu' }).boundingBox();
    expect(menu?.height ?? 0, 'altura do botão de menu').toBeGreaterThanOrEqual(44);
    expect(menu?.width ?? 0, 'largura do botão de menu').toBeGreaterThanOrEqual(44);

    // Gaveta da negociação no celular: é onde se lê o histórico.
    await page.getByText('Cobertura · Marista').first().click();
    await expect(page.getByText('Histórico da negociação')).toBeVisible();
    await page.screenshot({ path: `${EVIDENCIA}/negociacao-gaveta-celular.png`, fullPage: true });

    expect(erros, 'erros de página').toEqual([]);
  });
});
