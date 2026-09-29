import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockAudioAiProvider } from '@aluguei/integrations';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Cadastro de imóvel por áudio (ADR-104).
 *
 * O que estes testes seguram, em ordem de importância:
 *
 * 1. **Sem retenção zero declarada, o recurso não existe.** Nem abre rascunho.
 *    É a trava do ADR-104 vista de fora, pela API — não só pelo registro.
 * 2. **Nada vira imóvel sem confirmação.** Processar deixa o rascunho em
 *    revisão; o imóvel só nasce quando uma pessoa confirma.
 * 3. **A transcrição guardada já está redigida.** CPF, telefone e e-mail não
 *    ficam no banco; o que não é guardado não vaza depois.
 * 4. **Editar é ato de pessoa**: o campo passa a valer como editado e perde a
 *    evidência do áudio, que deixaria de descrever o valor que está lá.
 */

const DITADO =
  'Esse aqui é um apartamento pra alugar no Setor Bueno, tem dois quartos, uma vaga, ' +
  'uns setenta e dois metros quadrados. O aluguel é dois mil e trezentos, condomínio ' +
  'quatrocentos e oitenta mais ou menos. Aceita pet, não é mobiliado. ' +
  'O dono é o Marcos, CPF 529.982.247-25, telefone (62) 98812-5678.';

interface Rascunho {
  id: string;
  status: string;
  transcript: string | null;
  propertyId: string | null;
  fields: Array<{ key: string; value: string | null; state: string; evidence: string | null }>;
}

function campo(rascunho: Rascunho, chave: string) {
  const achado = rascunho.fields.find((f) => f.key === chave);
  if (!achado) {
    throw new Error(`campo ${chave} não veio na resposta`);
  }
  return achado;
}

describe('cadastro por áudio — sem retenção declarada', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;

  beforeAll(async () => {
    // Sem `audioAi`: é o estado padrão de qualquer instalação hoje.
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id, 'ILIMITADO');
  });

  afterAll(async () => {
    await app.close();
  });

  it('não deixa nem abrir o rascunho, e diz por quê', async () => {
    const res = await call(app, 'POST', '/property-drafts', {
      cookie: agencia.cookie,
      payload: {},
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('retenção zero');
  });

  it('/capabilities informa que a transcrição está desligada', async () => {
    const res = await call(app, 'GET', '/capabilities', { cookie: agencia.cookie });
    expect(res.status).toBe(200);
    expect((res.body.providers as { audio: unknown }).audio).toBeNull();
  });
});

describe('cadastro por áudio — com retenção zero declarada', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;
  let draftId = '';
  let audioKey = '';

  beforeAll(async () => {
    app = await buildTestApp({
      audioAi: new MockAudioAiProvider(DITADO),
      env: { AI_AUDIO_RETENTION: 'ZERO' },
    });
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id, 'ILIMITADO');
  });

  afterAll(async () => {
    await app.close();
  });

  async function subirAudio(): Promise<string> {
    const url = await call(app, 'POST', `/property-drafts/${draftId}/audio-url`, {
      cookie: agencia.cookie,
      payload: { mimeType: 'audio/webm', sizeBytes: 1024 },
    });
    expect(url.status, JSON.stringify(url.body)).toBe(200);
    const key = (url.body as { key: string }).key;
    // O upload real vai por PUT assinado; no teste escrevemos direto no storage.
    await app.storage?.putObject({
      key,
      body: Buffer.from('audio-de-teste'),
      contentType: 'audio/webm',
    });
    return key;
  }

  it('/capabilities informa que a transcrição está em simulação', async () => {
    const res = await call(app, 'GET', '/capabilities', { cookie: agencia.cookie });
    expect((res.body.providers as { audio: unknown }).audio).toBe('MOCK');
  });

  it('abre o rascunho vazio, em captura', async () => {
    const res = await call(app, 'POST', '/property-drafts', {
      cookie: agencia.cookie,
      payload: {},
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rascunho = res.body.draft as Rascunho;
    expect(rascunho.status).toBe('CAPTURING');
    expect(rascunho.propertyId).toBeNull();
    draftId = rascunho.id;
  });

  it('a chave do áudio é do servidor, e recusa chave de fora', async () => {
    audioKey = await subirAudio();
    expect(audioKey).toContain(`/property-drafts/${draftId}/audio/`);

    const invasao = await call(app, 'POST', `/property-drafts/${draftId}/process`, {
      cookie: agencia.cookie,
      payload: { key: 'orgs/outra/property-drafts/x/audio/y.webm' },
    });
    expect(invasao.status).toBe(400);
  });

  it('processa e deixa em revisão — não cria imóvel nenhum', async () => {
    const res = await call(app, 'POST', `/property-drafts/${draftId}/process`, {
      cookie: agencia.cookie,
      payload: { key: audioKey, seconds: 188 },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rascunho = res.body.draft as Rascunho;
    expect(rascunho.status).toBe('REVIEW');
    expect(rascunho.propertyId).toBeNull();

    expect(campo(rascunho, 'PROPERTY_TYPE')).toMatchObject({
      value: 'APARTMENT',
      state: 'FROM_AUDIO',
    });
    expect(campo(rascunho, 'MONTHLY_RENT_CENTS').value).toBe('230000');
    // "mais ou menos" vira confirmação, não valor fechado.
    expect(campo(rascunho, 'CONDO_FEE_CENTS').state).toBe('NEEDS_CONFIRMATION');
    // O título não é ditado: a pessoa escreve.
    expect(campo(rascunho, 'TITLE')).toMatchObject({ value: null, state: 'MISSING' });
  });

  it('a transcrição guardada não tem CPF, telefone nem e-mail', async () => {
    const res = await call(app, 'GET', `/property-drafts/${draftId}`, { cookie: agencia.cookie });
    const transcricao = (res.body.draft as Rascunho).transcript ?? '';
    expect(transcricao).toContain('apartamento');
    expect(transcricao).not.toMatch(/529\.?982/);
    expect(transcricao).not.toMatch(/98812/);
  });

  it('confirmar sem título recusa, em vez de criar "Sem título"', async () => {
    const res = await call(app, 'POST', `/property-drafts/${draftId}/confirm`, {
      cookie: agencia.cookie,
      payload: {},
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('título');
  });

  it('editar marca o campo como editado e larga a evidência do áudio', async () => {
    const res = await call(app, 'PATCH', `/property-drafts/${draftId}/fields`, {
      cookie: agencia.cookie,
      payload: {
        fields: [
          { key: 'TITLE', value: 'Apartamento 2 quartos · Setor Bueno' },
          { key: 'CONDO_FEE_CENTS', value: '48000' },
        ],
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rascunho = res.body.draft as Rascunho;
    expect(campo(rascunho, 'CONDO_FEE_CENTS')).toMatchObject({
      value: '48000',
      state: 'EDITED',
      evidence: null,
    });
    // O que não foi tocado continua como veio do áudio.
    expect(campo(rascunho, 'MONTHLY_RENT_CENTS').state).toBe('FROM_AUDIO');
  });

  it('apagar o valor devolve o campo para faltando', async () => {
    const res = await call(app, 'PATCH', `/property-drafts/${draftId}/fields`, {
      cookie: agencia.cookie,
      payload: { fields: [{ key: 'BATHROOMS', value: null }] },
    });
    expect(campo(res.body.draft as Rascunho, 'BATHROOMS')).toMatchObject({
      value: null,
      state: 'MISSING',
    });
  });

  it('confirmar cria o imóvel com o que foi revisado', async () => {
    const res = await call(app, 'POST', `/property-drafts/${draftId}/confirm`, {
      cookie: agencia.cookie,
      payload: {},
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const propertyId = (res.body as { propertyId: string }).propertyId;
    expect((res.body.draft as Rascunho).status).toBe('CONFIRMED');

    const imovel = await call(app, 'GET', `/properties/${propertyId}`, { cookie: agencia.cookie });
    expect(imovel.status, JSON.stringify(imovel.body)).toBe(200);
    const corpo = imovel.body.property as {
      title: string;
      propertyType: string;
      bedrooms: number | null;
      petsAllowed: boolean | null;
      addresses: Array<{ isPublic: boolean; street: string | null; neighborhood: string | null }>;
      financialTerms: { monthlyRentCents: number | null; condoFeeCents: number | null } | null;
    };
    expect(corpo.title).toBe('Apartamento 2 quartos · Setor Bueno');
    expect(corpo.propertyType).toBe('APARTMENT');
    expect(corpo.bedrooms).toBe(2);
    expect(corpo.petsAllowed).toBe(true);
    expect(corpo.financialTerms?.monthlyRentCents).toBe(230_000);
    // O valor editado é o que vale, não o que a IA tinha sugerido.
    expect(corpo.financialTerms?.condoFeeCents).toBe(48_000);
    // A vitrine recebe bairro; a rua fica no endereço privado.
    const publico = corpo.addresses.find((endereco) => endereco.isPublic);
    expect(publico?.neighborhood).toBe('Setor Bueno');
    expect(publico?.street ?? null).toBeNull();
  });

  it('rascunho confirmado não é processado nem descartado de novo', async () => {
    const processar = await call(app, 'POST', `/property-drafts/${draftId}/process`, {
      cookie: agencia.cookie,
      payload: { key: audioKey },
    });
    expect(processar.status).toBe(409);
    const descartar = await call(app, 'POST', `/property-drafts/${draftId}/discard`, {
      cookie: agencia.cookie,
      payload: {},
    });
    expect(descartar.status).toBe(409);
  });

  it('rascunho de outra imobiliária não existe para esta', async () => {
    const outra = await registerAgency(app);
    await approveAgency(app, outra.org.id, 'ILIMITADO');
    const res = await call(app, 'GET', `/property-drafts/${draftId}`, { cookie: outra.cookie });
    expect(res.status).toBe(404);
  });
});
