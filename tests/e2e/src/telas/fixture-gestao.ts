import { expect } from '@playwright/test';
import { API, WEB, api, platformAdminSession, waitForRetryAfter } from '../g2-b1-support';

/**
 * Base das capturas da gestão (rodada de fidelidade, F4): os planos das telas e a "Imobiliária
 * Exemplo" do Rafael Almeida, como nos prints de `design-source/achouimovel/prints/gestao`. Os
 * planos saem da API da plataforma, pelo mesmo caminho que a equipe usa; a imobiliária é uma só
 * (o nome vira slug único) e troca de plano entre as telas — por isso os specs de captura da
 * gestão rodam em série.
 */

export type PlanoDasTelas = 'ANUNCIANTE' | 'GESTAO_LOCACAO' | 'GESTAO_VENDAS';

/*
 * Com preço público, os planos das telas são a oferta da tela de upgrade diante dos planos semeados
 * (sem preço): `planoQueAbre` escolhe o mais barato que inclui o módulo. O Gestão Locação dos prints
 * abre todo o menu (Visão Geral com Negociações e Marketing liberados).
 */
const PLANOS: Record<
  PlanoDasTelas,
  { name: string; modules: string[]; monthlyPriceCents: number }
> = {
  // O Anunciante publica e recebe leads: nenhum módulo (o cadeado cobre o resto do menu).
  ANUNCIANTE: { name: 'Anunciante', modules: [], monthlyPriceCents: 9_900 },
  GESTAO_LOCACAO: {
    name: 'Gestão Locação',
    modules: ['CRM', 'ATENDIMENTO', 'LOCACAO', 'FINANCEIRO', 'VENDAS', 'MARKETING'],
    monthlyPriceCents: 29_900,
  },
  GESTAO_VENDAS: {
    name: 'Gestão Vendas',
    modules: ['CRM', 'ATENDIMENTO', 'VENDAS', 'MARKETING'],
    monthlyPriceCents: 34_900,
  },
};

const RAFAEL = {
  name: 'Rafael Almeida',
  email: 'rafael.almeida@telas.e2e.test',
  password: 'e2e-telas-senha-123',
  organizationName: 'Imobiliária Exemplo',
};

async function planoId(codigo: PlanoDasTelas): Promise<string> {
  const admin = await platformAdminSession();
  const lista = await api<{ plans: Array<{ id: string; code: string }> }>(
    'GET',
    '/platform/plans',
    {
      cookie: admin,
    },
  );
  expect(lista.status).toBe(200);
  const existente = lista.body.plans.find((plano) => plano.code === codigo);
  if (existente) return existente.id;
  const criado = await api<{ plan: { id: string } }>('POST', '/platform/plans', {
    cookie: admin,
    json: {
      code: codigo,
      ...PLANOS[codigo],
      maxUsers: null,
      maxProperties: null,
      maxPublishedListings: null,
      maxActiveLeases: null,
    },
  });
  expect(criado.status, JSON.stringify(criado.body)).toBe(201);
  return criado.body.plan.id;
}

function cookieDe(res: Response): string {
  const token = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .find((c) => c.startsWith('aluguei_session='));
  expect(token, 'a API deve devolver o cookie de sessão').toBeTruthy();
  return token ?? '';
}

export interface ImobiliariaDasTelas {
  cookie: string;
  orgId: string;
}

/**
 * A "Imobiliária Exemplo" no plano pedido: cadastra na primeira vez, entra nas seguintes, e a
 * plataforma põe no plano da tela.
 */
export async function imobiliariaExemplo(plano: PlanoDasTelas): Promise<ImobiliariaDasTelas> {
  let res: Response;
  for (let tentativa = 1; ; tentativa += 1) {
    res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(RAFAEL),
    });
    if (res.status !== 429 || tentativa === 3) break;
    await waitForRetryAfter(res.headers.get('retry-after'));
  }

  let cookie: string;
  if (res.status === 201) {
    cookie = cookieDe(res);
    const corpo = (await res.json()) as { org: { id: string } };
    const aprovada = await api('POST', `/platform/organizations/${corpo.org.id}/approve`, {
      cookie: await platformAdminSession(),
      json: {},
    });
    expect(aprovada.status).toBe(200);
  } else {
    expect(res.status, 'a imobiliária das telas já existe: entra com a mesma conta').toBe(409);
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: RAFAEL.email, password: RAFAEL.password }),
    });
    expect(login.status).toBe(200);
    cookie = cookieDe(login);
  }

  const me = await api<{ activeOrg: { id: string } }>('GET', '/auth/me', { cookie });
  expect(me.status).toBe(200);
  const orgId = me.body.activeOrg.id;
  const troca = await api('PUT', `/platform/organizations/${orgId}/plan`, {
    cookie: await platformAdminSession(),
    json: { planId: await planoId(plano) },
  });
  expect(troca.status, JSON.stringify(troca.body)).toBe(200);
  return { cookie, orgId };
}

/** Segunda-feira, 09:12 em São Paulo, como o relógio dos prints da gestão. */
export const SEGUNDA_0912 = new Date('2026-09-28T12:12:00.000Z');

export { WEB };
