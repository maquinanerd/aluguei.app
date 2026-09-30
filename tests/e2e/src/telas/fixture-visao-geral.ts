import { expect } from '@playwright/test';
import { api, poll, uniq, waitForRetryAfter } from '../g2-b1-support';
import type { ApiResult } from '../g2-b1-support';
import { outboxToken, spDatePlus } from '../g3-d-support';

/**
 * Dados da Visão Geral da "Imobiliária Exemplo" para a captura da tela 32 (ADR-105, B14), pela API,
 * no plano Gestão Locação. A fila fica com os cinco tipos do desenho — "3 pendências exigem atenção
 * hoje." e "5 item(ns) exigem atenção" — e o menu com Leads 7 e Tarefas 3, como no print.
 *
 * O que a API não deixa reproduzir fica como é: o lead chega na hora da captura ("sem retorno há
 * 0 min"); o código do imóvel (IMV-0165) não se define pela API; e só o canal de teste recusa
 * anúncio (D1), então a linha do canal diz "Canal de teste recusou o anúncio".
 */

interface Id {
  id: string;
}

/** Instante de hoje em São Paulo (UTC-3 fixo desde 2019), no relógio da API. */
function hojeAs(hora: string): string {
  return new Date(`${spDatePlus(0)}T${hora}:00.000-03:00`).toISOString();
}

async function pessoa(cookie: string, nome: string): Promise<string> {
  const email = `${nome.toLowerCase().replace(/\s+/g, '.')}.${uniq()}@telas.e2e.test`;
  const res = await api<{ party: Id }>('POST', '/parties', {
    cookie,
    json: { type: 'PERSON', name: nome, identities: [{ kind: 'EMAIL', value: email }] },
  });
  expect(res.status, `pessoa "${nome}": ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.party.id;
}

interface Imovel {
  titulo: string;
  tipo: string;
  quartos: number;
  bairro: string;
}

/** Imóvel de Goiânia com aluguel e endereço público: pronto para anúncio. */
async function imovel(cookie: string, dados: Imovel): Promise<string> {
  const criado = await api<{ property: Id }>('POST', '/properties', {
    cookie,
    json: { title: dados.titulo, propertyType: dados.tipo, bedrooms: dados.quartos },
  });
  expect(criado.status, `imóvel "${dados.titulo}": ${JSON.stringify(criado.body)}`).toBe(201);
  const propertyId = criado.body.property.id;
  const termos = await api('PUT', `/properties/${propertyId}/financial-terms`, {
    cookie,
    json: { monthlyRentCents: 250_000, minimumLeaseMonths: 12 },
  });
  expect(termos.status).toBe(200);
  const endereco = await api('PUT', `/properties/${propertyId}/address`, {
    cookie,
    json: {
      privateAddress: { street: 'Rua Privada', number: '10', city: 'Goiânia', state: 'GO' },
      publicAddress: { neighborhood: dados.bairro, city: 'Goiânia', state: 'GO' },
    },
  });
  expect(endereco.status).toBe(200);
  return propertyId;
}

async function anuncio(cookie: string, propertyId: string, titulo: string): Promise<string> {
  const criado = await api<{ listing: Id }>('POST', '/listings', {
    cookie,
    json: { propertyId, title: titulo },
  });
  expect(criado.status, `anúncio "${titulo}"`).toBe(201);
  return criado.body.listing.id;
}

/** Anúncio publicado no portal: põe Goiânia (e o nome do bairro) na demanda da imobiliária. */
async function publicado(cookie: string, dados: Imovel): Promise<string> {
  const propertyId = await imovel(cookie, dados);
  const listingId = await anuncio(cookie, propertyId, dados.titulo);
  for (const status of ['READY', 'PUBLISHED']) {
    const res = await api('PATCH', `/listings/${listingId}/status`, { cookie, json: { status } });
    expect(res.status, `anúncio "${dados.titulo}" → ${status}`).toBe(200);
  }
  return propertyId;
}

/** Lead criado agora; a API põe quem cria como responsável, e `semDono` o tira. */
async function lead(
  cookie: string,
  nome: string,
  dados: { source: string; channel: string; funil: string[]; semDono?: boolean },
): Promise<string> {
  const partyId = await pessoa(cookie, nome);
  const criado = await api<{ lead: Id }>('POST', '/leads', {
    cookie,
    json: { partyId, source: dados.source, channel: dados.channel },
  });
  expect(criado.status, `lead "${nome}"`).toBe(201);
  const leadId = criado.body.lead.id;
  for (const status of dados.funil) {
    const res = await api('PATCH', `/leads/${leadId}/status`, { cookie, json: { status } });
    expect(res.status, `lead "${nome}" → ${status}`).toBe(200);
  }
  if (dados.semDono === true) {
    const res = await api('PATCH', `/leads/${leadId}`, { cookie, json: { ownerUserId: null } });
    expect(res.status, `lead "${nome}" sem responsável`).toBe(200);
  }
  return partyId;
}

async function proposta(
  cookie: string,
  dados: { partyId: string; propertyId: string; validUntil: string; aceita?: boolean },
): Promise<void> {
  const criada = await api<{ proposal: Id }>('POST', '/proposals', {
    cookie,
    json: { partyId: dados.partyId, propertyId: dados.propertyId, monthlyRentCents: 240_000 },
  });
  expect(criada.status).toBe(201);
  const id = criada.body.proposal.id;
  const enviada = await api('PATCH', `/proposals/${id}/status`, {
    cookie,
    json: { status: 'SENT', validUntil: dados.validUntil },
  });
  expect(enviada.status, JSON.stringify(enviada.body)).toBe(200);
  if (dados.aceita === true) {
    const aceita = await api('PATCH', `/proposals/${id}/status`, {
      cookie,
      json: { status: 'ACCEPTED' },
    });
    expect(aceita.status, JSON.stringify(aceita.body)).toBe(200);
  }
}

/**
 * Publicação recusada pelo canal de teste. A API valida o anúncio antes de enfileirar; o worker
 * valida de novo a cada 5 s. Tirar a cidade do endereço logo depois de publicar faz o canal recusar
 * ("endereço público (cidade) é obrigatório"). Se o worker passar antes, o anúncio sai publicado e
 * a tentativa se repete com outro imóvel.
 */
async function recusaDoCanal(cookie: string): Promise<void> {
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    const propertyId = await imovel(cookie, {
      titulo: `Kitnet 32 m² Setor Universitário ${String(tentativa)}`,
      tipo: 'STUDIO',
      quartos: 1,
      bairro: 'Setor Universitário',
    });
    const listingId = await anuncio(cookie, propertyId, 'Kitnet 32 m² · Setor Universitário');
    const publicar = await api('POST', `/listings/${listingId}/channels/fake/publish`, {
      cookie,
      json: {},
    });
    expect(publicar.status, JSON.stringify(publicar.body)).toBe(201);
    const semCidade = await api('PUT', `/properties/${propertyId}/address`, {
      cookie,
      json: { publicAddress: { neighborhood: 'Setor Universitário', city: '', state: 'GO' } },
    });
    expect(semCidade.status).toBe(200);
    const fim = await poll(
      () =>
        api<{ channels: Array<{ channel: string; status: string }> }>(
          'GET',
          `/listings/${listingId}/channels`,
          { cookie },
        ),
      (res) =>
        res.body.channels.some(
          (item) => item.channel === 'fake' && ['FAILED', 'PUBLISHED'].includes(item.status),
        ),
      'o worker processa a publicação no canal de teste',
    );
    if (fim.body.channels.some((item) => item.status === 'FAILED')) return;
  }
  throw new Error('o canal de teste publicou antes da invalidação em três tentativas');
}

/** Alerta de imóvel confirmado pelo link do e-mail (caixa de saída local), como no portal. */
async function alertaAtivo(pedido: {
  neighborhood: string;
  propertyType: string;
  bedrooms?: number;
}): Promise<void> {
  const email = `alerta.${uniq()}@telas.e2e.test`;
  let criado: ApiResult<unknown> | undefined;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    criado = await api('POST', '/public/alerts', {
      json: {
        purpose: 'RENT',
        city: 'goiania-go',
        ...pedido,
        contactKind: 'EMAIL',
        contactValue: email,
        consent: true,
      },
    });
    if (criado.status !== 429) break;
    await waitForRetryAfter(criado.headers.get('retry-after'));
  }
  expect(criado?.status, `alerta: ${JSON.stringify(criado?.body)}`).toBe(201);
  const token = await outboxToken(email, 'SEARCH_ALERT_CONFIRM');
  const confirmado = await api('POST', '/public/alerts/confirm', { json: { token } });
  expect(confirmado.status).toBe(200);
}

export async function semearVisaoGeral(cookie: string): Promise<void> {
  // Anúncios publicados em Goiânia: a cidade e os nomes dos bairros da demanda.
  const casa = await publicado(cookie, {
    titulo: 'Casa Jardim América',
    tipo: 'HOUSE',
    quartos: 3,
    bairro: 'Jardim América',
  });
  const apto3 = await publicado(cookie, {
    titulo: 'Apto 3 qts Marista',
    tipo: 'APARTMENT',
    quartos: 3,
    bairro: 'Setor Marista',
  });
  const reservado = await publicado(cookie, {
    titulo: 'Apto 2 qts Setor Bueno',
    tipo: 'APARTMENT',
    quartos: 2,
    bairro: 'Setor Bueno',
  });
  await publicado(cookie, {
    titulo: 'Kitnet 28 m² Setor Universitário',
    tipo: 'STUDIO',
    quartos: 1,
    bairro: 'Setor Universitário',
  });
  const apto804 = await imovel(cookie, {
    titulo: 'Apto 804 Setor Marista',
    tipo: 'APARTMENT',
    quartos: 2,
    bairro: 'Setor Marista',
  });

  // Sete leads hoje: um sem retorno, dois em qualificação (3 aguardando resposta) e quatro
  // qualificados. Dois sem responsável ("Sem atendimento 2").
  const portal = { source: 'PORTAL_ACHOUIMOVEL', channel: 'PORTAL' };
  const whatsapp = { source: 'WHATSAPP', channel: 'WHATSAPP' };
  const qualificado = ['QUALIFYING', 'QUALIFIED'];
  await lead(cookie, 'Mariana Costa', { ...portal, funil: [], semDono: true });
  await lead(cookie, 'Ana Lima', { ...whatsapp, funil: ['QUALIFYING'], semDono: true });
  await lead(cookie, 'Bruno Rocha', { ...portal, funil: ['QUALIFYING'] });
  await lead(cookie, 'Paula Nunes', { ...portal, funil: qualificado });
  const joao = await lead(cookie, 'João Pereira', { ...whatsapp, funil: qualificado });
  const carlos = await lead(cookie, 'Carlos Dias', { ...portal, funil: qualificado });
  const lucas = await lead(cookie, 'Lucas Martins', { ...portal, funil: qualificado });

  // Tarefas: uma atrasada e duas para hoje (o menu mostra 3).
  for (const [titulo, dueAt] of [
    ['Retornar a Mariana Costa', new Date(Date.now() - 60 * 60_000).toISOString()],
    ['Enviar contrato ao Lucas Martins', new Date(Date.now() + 5 * 60_000).toISOString()],
    ['Confirmar vistoria do Apto 804', new Date(Date.now() + 10 * 60_000).toISOString()],
  ] as const) {
    const tarefa = await api('POST', '/tasks', { cookie, json: { title: titulo, dueAt } });
    expect(tarefa.status, JSON.stringify(tarefa.body)).toBe(201);
  }

  // A fila: visita de hoje, proposta que vence hoje, vistoria de hoje e a recusa do canal.
  const visita = await api('POST', '/visits', {
    cookie,
    json: { partyId: joao, propertyId: casa, scheduledAt: hojeAs('10:30') },
  });
  expect(visita.status, JSON.stringify(visita.body)).toBe(201);
  await proposta(cookie, { partyId: carlos, propertyId: apto3, validUntil: spDatePlus(0) });
  // Proposta aceita sem locação: o imóvel fica reservado.
  await proposta(cookie, {
    partyId: lucas,
    propertyId: reservado,
    validUntil: spDatePlus(7),
    aceita: true,
  });
  const vistoria = await api('POST', '/inspections', {
    cookie,
    json: { propertyId: apto804, type: 'CHECKIN', scheduledAt: hojeAs('14:00') },
  });
  expect(vistoria.status, JSON.stringify(vistoria.body)).toBe(201);
  await recusaDoCanal(cookie);

  // Demanda por bairro: cinco alertas confirmados em Goiânia (o portal aceita 5 por minuto).
  await alertaAtivo({ neighborhood: 'setor-bueno', propertyType: 'APARTMENT', bedrooms: 2 });
  await alertaAtivo({ neighborhood: 'setor-bueno', propertyType: 'APARTMENT', bedrooms: 2 });
  await alertaAtivo({ neighborhood: 'setor-marista', propertyType: 'APARTMENT', bedrooms: 3 });
  await alertaAtivo({ neighborhood: 'setor-universitario', propertyType: 'STUDIO' });
  await alertaAtivo({ neighborhood: 'jardim-america', propertyType: 'HOUSE' });
}
