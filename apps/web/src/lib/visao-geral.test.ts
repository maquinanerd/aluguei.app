import { describe, expect, it } from 'vitest';
import { inspectionTypeSchema, propertyTypeSchema } from '@aluguei/contracts';
import {
  TIPO_NA_DEMANDA,
  VISTORIA_NA_FILA,
  fraseDasPendencias,
  haQuanto,
  larguras,
  linhaDaFila,
  quando,
  saudacao,
  tipoDaDemanda,
} from './visao-geral';

/** Segunda-feira, 09:12 em São Paulo: o relógio dos prints da gestão. */
const AGORA = new Date('2026-09-28T12:12:00.000Z');
/** Horário de São Paulo (UTC-3) em 28/09/2026. */
const as = (hora: string) => `2026-09-28T${hora}:00.000-03:00`;

describe('Visão Geral: a fila "Próximas ações" (tela 32)', () => {
  it('as cinco linhas do desenho, a partir do dado da API', () => {
    const linhas = [
      linhaDaFila(
        {
          kind: 'LEAD',
          tone: 'danger',
          id: 'l1',
          name: 'Mariana Costa',
          source: 'PORTAL_ACHOUIMOVEL',
          channel: 'PORTAL',
          at: as('08:42'),
        },
        AGORA,
      ),
      linhaDaFila(
        {
          kind: 'VISIT',
          tone: 'neutral',
          id: 'v1',
          name: 'João Pereira',
          property: 'Casa Jardim América',
          status: 'SCHEDULED',
          at: as('10:30'),
        },
        AGORA,
      ),
      linhaDaFila(
        {
          kind: 'PROPOSAL',
          tone: 'warning',
          id: 'p1',
          name: 'Carlos Dias',
          property: 'Apto 3 qts Marista',
          validUntil: '2026-09-28',
        },
        AGORA,
      ),
      linhaDaFila(
        {
          kind: 'INSPECTION',
          tone: 'neutral',
          id: 'i1',
          inspectionType: 'CHECKIN',
          property: 'Apto 804 Setor Marista',
          status: 'DRAFT',
          at: as('14:00'),
        },
        AGORA,
      ),
      linhaDaFila(
        {
          kind: 'CHANNEL',
          tone: 'warning',
          id: 'c1',
          channel: 'olx',
          propertyCode: 'IMV-0165',
          error: 'foto abaixo do mínimo',
          at: '2026-09-27T19:40:00.000-03:00',
        },
        AGORA,
      ),
    ];
    expect(
      linhas.map(({ tipo, titulo, meta, prazo, tom }) => [tipo, titulo, meta, prazo, tom]),
    ).toEqual([
      [
        'LEAD',
        'Mariana Costa · sem retorno há 30 min',
        'Portal AchouImóvel',
        'Hoje 08:42',
        'danger',
      ],
      ['VISITA', 'João Pereira · Casa Jardim América', 'Agendada', 'Hoje 10:30', 'neutral'],
      ['PROPOSTA', 'Carlos Dias · Apto 3 qts Marista', 'Vence hoje', 'Hoje', 'warning'],
      ['VISTORIA', 'Entrada · Apto 804 Setor Marista', 'Em aberto', 'Hoje 14:00', 'neutral'],
      [
        'CANAL',
        'OLX recusou IMV-0165 · foto abaixo do mínimo',
        'Falha de publicação',
        'Ontem',
        'warning',
      ],
    ]);
    expect(linhas.map((linha) => linha.href)).toEqual([
      '/app/crm/leads/l1',
      '/app/visits',
      '/app/proposals',
      '/app/inspections/i1',
      '/app/channels',
    ]);
  });

  it('sem nome, sem imóvel e sem motivo, a linha continua legível', () => {
    const lead = linhaDaFila(
      {
        kind: 'LEAD',
        tone: 'danger',
        id: 'l',
        name: null,
        source: null,
        channel: null,
        at: as('09:00'),
      },
      AGORA,
    );
    expect([lead.titulo, lead.meta]).toEqual([
      'Lead sem nome · sem retorno há 12 min',
      'Sem origem',
    ]);
    const canal = linhaDaFila(
      {
        kind: 'CHANNEL',
        tone: 'warning',
        id: 'c',
        channel: 'zap',
        propertyCode: null,
        error: null,
        at: '2026-09-20T10:00:00.000-03:00',
      },
      AGORA,
    );
    expect([canal.titulo, canal.prazo]).toEqual(['ZAP Imóveis recusou o anúncio', '20/09']);
  });

  it('quando e há quanto, no fuso de São Paulo', () => {
    // 23:30 de domingo em São Paulo já é segunda em UTC: é "Ontem", não "Hoje".
    expect(quando('2026-09-28T02:30:00.000Z', AGORA)).toBe('Ontem');
    expect(quando(as('00:05'), AGORA)).toBe('Hoje 00:05');
    expect(haQuanto(as('07:12'), AGORA)).toBe('há 2 h');
    expect(haQuanto('2026-09-27T09:00:00.000-03:00', AGORA)).toBe('há 1 dia');
    expect(haQuanto('2026-09-25T09:00:00.000-03:00', AGORA)).toBe('há 3 dias');
  });
});

describe('Visão Geral: ciclo, demanda e cabeçalho (tela 32)', () => {
  it('as barras seguem o renderVals() do desenho', () => {
    expect(larguras([31, 14, 9, 4, 2, 3, 2])).toEqual([
      '100%',
      '45%',
      '29%',
      '13%',
      '6%',
      '10%',
      '6%',
    ]);
    expect(larguras([38, 24, 21, 14])).toEqual(['100%', '63%', '55%', '37%']);
    // Sem dado (ou sem permissão), barra vazia — nunca divisão por zero.
    expect(larguras([null, 0])).toEqual(['0%', '0%']);
  });

  it('o tipo da demanda como no cartão', () => {
    expect(tipoDaDemanda({ propertyType: 'APARTMENT', bedrooms: 2, purpose: 'RENT' })).toBe(
      'Apto 2 qts',
    );
    expect(tipoDaDemanda({ propertyType: 'STUDIO', bedrooms: null, purpose: 'RENT' })).toBe(
      'Kitnet',
    );
    expect(tipoDaDemanda({ propertyType: 'HOUSE', bedrooms: null, purpose: 'RENT' })).toBe('Casa');
    expect(tipoDaDemanda({ propertyType: null, bedrooms: 1, purpose: 'RENT' })).toBe('1 qto');
    expect(tipoDaDemanda({ propertyType: 'HOUSE', bedrooms: 4, purpose: 'SALE' })).toBe(
      'Casa 4+ qts à venda',
    );
    expect(tipoDaDemanda({ propertyType: null, bedrooms: null, purpose: 'RENT' })).toBe(
      'Qualquer imóvel',
    );
  });

  it('todo tipo de imóvel e de vistoria do contrato tem nome curto', () => {
    expect(Object.keys(TIPO_NA_DEMANDA).sort()).toEqual([...propertyTypeSchema.options].sort());
    expect(Object.keys(VISTORIA_NA_FILA).sort()).toEqual([...inspectionTypeSchema.options].sort());
  });

  it('saudação e pendências', () => {
    expect(saudacao(AGORA)).toBe('Bom dia');
    expect(saudacao(new Date(as('12:00')))).toBe('Boa tarde');
    expect(saudacao(new Date(as('18:00')))).toBe('Boa noite');
    expect(saudacao(new Date(as('04:59')))).toBe('Boa noite');
    expect(fraseDasPendencias(3)).toBe('3 pendências exigem atenção hoje.');
    expect(fraseDasPendencias(1)).toBe('1 pendência exige atenção hoje.');
    expect(fraseDasPendencias(0)).toBe('Nenhuma pendência exige atenção hoje.');
  });
});
