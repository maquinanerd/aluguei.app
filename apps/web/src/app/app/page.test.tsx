import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Visão Geral (tela 32, `telas/gestao/01-painel.dc.html#visao`; ADR-105, B14) com os números do
 * `renderVals()` do desenho (:224-238): os textos, as cores de alerta e as barras saem do dado da
 * API, e seção sem permissão mostra "—".
 */

const pedidos: string[] = [];
let resumo: Record<string, unknown> | null;
let demanda: Record<string, unknown> | null;

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect ${destino}`);
  },
}));

vi.mock('@/lib/api-server', () => ({
  apiFetch: (caminho: string) => {
    pedidos.push(caminho);
    if (caminho === '/auth/me') {
      return Promise.resolve({ user: { id: 'u-1', name: 'Rafael Almeida', email: 'r@e.test' } });
    }
    if (caminho === '/dashboard/summary') {
      return resumo === null ? Promise.reject(new Error('fora do ar')) : Promise.resolve(resumo);
    }
    if (caminho.startsWith('/reporting/demand-by-neighborhood')) {
      return demanda === null ? Promise.reject(new Error('403')) : Promise.resolve(demanda);
    }
    return Promise.reject(new Error(`rota inesperada ${caminho}`));
  },
}));

import OverviewPage from './page';

/** Segunda-feira, 09:12 em São Paulo. */
const AGORA = '2026-09-28T12:12:00.000Z';
const as = (hora: string) => `2026-09-28T${hora}:00.000-03:00`;

function resumoDoDesenho(): Record<string, unknown> {
  return {
    generatedAt: AGORA,
    crm: {
      openLeads: 40,
      newLeadsToday: 7,
      leadsWithoutOwner: 2,
      awaitingResponse: 3,
      qualified: 5,
    },
    tasks: { overdue: 1, dueToday: 2 },
    properties: { available: 58, archived: 14, reserved: 6 },
    listings: { publishedPublications: 212, failedPublications: 1 },
    screening: { total: 9, pending: 2 },
    contracts: { nonVoid: 20, pending: 3, awaitingSignature: 1 },
    inspections: { open: 4 },
    finance: {
      activeLeases: 96,
      scheduledCharges: 41,
      openCharges: 12,
      overdueCharges: 2,
      pendingPayouts: 5,
    },
    queue: {
      items: [
        {
          kind: 'LEAD',
          tone: 'danger',
          id: 'l1',
          name: 'Mariana Costa',
          source: 'PORTAL_ACHOUIMOVEL',
          channel: 'PORTAL',
          at: as('08:42'),
        },
        {
          kind: 'VISIT',
          tone: 'neutral',
          id: 'v1',
          name: 'João Pereira',
          property: 'Casa Jardim América',
          status: 'SCHEDULED',
          at: as('10:30'),
        },
        {
          kind: 'PROPOSAL',
          tone: 'warning',
          id: 'p1',
          name: 'Carlos Dias',
          property: 'Apto 3 qts Marista',
          validUntil: '2026-09-28',
        },
        {
          kind: 'INSPECTION',
          tone: 'neutral',
          id: 'i1',
          inspectionType: 'CHECKIN',
          property: 'Apto 804 Setor Marista',
          status: 'DRAFT',
          at: as('14:00'),
        },
        {
          kind: 'CHANNEL',
          tone: 'warning',
          id: 'c1',
          channel: 'olx',
          propertyCode: 'IMV-0165',
          error: 'foto abaixo do mínimo',
          at: '2026-09-27T19:40:00.000-03:00',
        },
      ],
      total: 5,
      attention: 3,
    },
    week: {
      start: '2026-09-28T03:00:00.000Z',
      leads: 31,
      qualified: 14,
      visits: 9,
      proposals: 4,
      screening: 2,
      contracts: 3,
      leases: 2,
    },
  };
}

function demandaDoDesenho(): Record<string, unknown> {
  const linha = (
    neighborhood: string,
    propertyType: string,
    bedrooms: number | null,
    n: number,
  ) => ({
    neighborhoodSlug: neighborhood.toLowerCase().replace(/\s+/g, '-'),
    neighborhood,
    purpose: 'RENT',
    propertyType,
    bedrooms,
    count: n,
    published: 0,
  });
  return {
    city: 'goiania-go',
    cityLabel: 'Goiânia',
    totalActiveAlerts: 97,
    rows: [
      linha('Setor Bueno', 'APARTMENT', 2, 38),
      linha('Setor Marista', 'APARTMENT', 3, 24),
      linha('Setor Universitário', 'STUDIO', null, 21),
      linha('Jardim América', 'HOUSE', null, 14),
    ],
  };
}

async function html(): Promise<string> {
  return renderToStaticMarkup(await OverviewPage());
}

/** Texto visível, sem tags, com os espaços normalizados. */
function texto(marcacao: string): string {
  return marcacao
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
}

describe('Visão Geral (tela 32)', () => {
  beforeEach(() => {
    pedidos.length = 0;
    resumo = resumoDoDesenho();
    demanda = demandaDoDesenho();
  });

  it('cabeçalho, cartões e colunas como no desenho', async () => {
    const pagina = await html();
    const visivel = texto(pagina);
    expect(visivel).toContain('Bom dia, Rafael');
    expect(visivel).toContain('3 pendências exigem atenção hoje.');
    expect(visivel).toContain('Minha agenda');
    expect(visivel).toContain('+ Novo imóvel');
    for (const trecho of [
      'CRM › Novos leads hoje 7 Sem atendimento 2 Aguardando resposta 3 Atividades atrasadas 1',
      'Imóveis › Disponíveis 58 Publicações ativas 212 Arquivados 14 Reservados 6',
      'Operação › Crédito pendente 2 Contratos aguardando 3 Vistorias em aberto 4 Locações ativas 96',
      'Financeiro › Cobranças agendadas 41 Em aberto 12 Vencidas 2 Repasses pendentes 5',
    ]) {
      expect(visivel).toContain(trecho);
    }
    // Âmbar em "Sem atendimento" e vermelho em "Atividades atrasadas" e "Vencidas" (:225-228).
    expect(pagina.match(/dash-summary__value--aviso/g)).toHaveLength(1);
    expect(pagina.match(/dash-summary__value--perigo/g)).toHaveLength(2);
    // Saíram a faixa de alertas e o cartão Atendimento, que o desenho não tem.
    expect(visivel).not.toContain('Atendimento');
    expect(pagina).not.toContain('dash-alert');
  });

  it('a fila "Próximas ações" com as cinco linhas', async () => {
    const visivel = texto(await html());
    expect(visivel).toContain('Próximas ações · minha fila 5 item(ns) exigem atenção Ver tarefas');
    for (const linha of [
      'LEAD Mariana Costa · sem retorno há 30 min Portal AchouImóvel Hoje 08:42 ›',
      'VISITA João Pereira · Casa Jardim América Agendada Hoje 10:30 ›',
      'PROPOSTA Carlos Dias · Apto 3 qts Marista Vence hoje Hoje ›',
      'VISTORIA Entrada · Apto 804 Setor Marista Em aberto Hoje 14:00 ›',
      'CANAL OLX recusou IMV-0165 · foto abaixo do mínimo Falha de publicação Ontem ›',
    ]) {
      expect(visivel).toContain(linha);
    }
  });

  it('ciclo da semana e demanda por tipo, com as larguras do desenho', async () => {
    const pagina = await html();
    const visivel = texto(pagina);
    expect(visivel).toContain(
      'Ciclo de locação · esta semana Leads 31 Qualif. 14 Visitas 9 Propostas 4 Crédito 2 Contrato 3 Locação 2',
    );
    expect(visivel).toContain(
      'Demanda por bairro Novo alertas ativos no portal Setor Bueno · Apto 2 qts 38 Setor Marista · Apto 3 qts 24 Setor Universitário · Kitnet 21 Jardim América · Casa 14 Só contagens. O contato de quem criou o alerta nunca aparece.',
    );
    const larguras = [...pagina.matchAll(/style="width:(\d+%)"/g)].map((m) => m[1]);
    expect(larguras).toEqual([
      ...['100%', '45%', '29%', '13%', '6%', '10%', '6%'],
      ...['100%', '63%', '55%', '37%'],
    ]);
    expect(pedidos).toContain('/reporting/demand-by-neighborhood?groupBy=type&limit=4');
  });

  it('sem permissão, "—"; sem relatório, o cartão da demanda some', async () => {
    const semFinanceiro = resumoDoDesenho();
    semFinanceiro.finance = null;
    semFinanceiro.week = { ...(semFinanceiro.week as object), leases: null };
    resumo = semFinanceiro;
    demanda = null;
    const visivel = texto(await html());
    expect(visivel).toContain('Financeiro › Cobranças agendadas — Em aberto — Vencidas — Repasses');
    expect(visivel).toContain('Locações ativas —');
    expect(visivel).toContain('Locação —');
    expect(visivel).not.toContain('Demanda por bairro');
  });

  it('sem resumo, diz que não carregou em vez de mostrar zero', async () => {
    resumo = null;
    const visivel = texto(await html());
    expect(visivel).toContain('Não foi possível carregar os indicadores agora.');
    expect(visivel).toContain('Fila indisponível no momento.');
    expect(visivel).toContain('Novos leads hoje —');
    expect(visivel).not.toMatch(/Novos leads hoje 0/);
  });

  it('sem anúncio publicado, a demanda explica em vez de inventar cidade', async () => {
    demanda = { city: null, cityLabel: null, totalActiveAlerts: 0, rows: [] };
    const visivel = texto(await html());
    expect(visivel).toContain('Publique um anúncio para ver o que procuram nos seus bairros.');
  });
});
