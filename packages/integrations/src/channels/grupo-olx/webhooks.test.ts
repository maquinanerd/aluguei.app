import { describe, expect, it } from 'vitest';
import {
  grupoOlxAuthorizationHeader,
  grupoOlxLeadPayloadSchema,
  grupoOlxReportPayloadSchema,
  normalizeGrupoOlxLead,
  normalizeGrupoOlxReport,
  parseGrupoOlxReportDate,
  verifyGrupoOlxAuthorization,
} from './webhooks.js';

const SECRET = '594F803B380A41396ED63DCA39503542';

/** Exemplo oficial de lead de anúncio (developers.grupozap.com, 01/10/2026). */
export const OFFICIAL_LEAD = {
  leadOrigin: 'Grupo OLX',
  timestamp: '2017-10-23T15:50:30.619Z',
  originLeadId: '59ee0fc6e4b043e1b2a6d863',
  originListingId: '87027856',
  clientListingId: 'a40171',
  name: 'Nome Consumidor',
  email: 'nome.consumidor@email.com',
  ddd: '11',
  phone: '999999999',
  phoneNumber: '11999999999',
  message: 'Olá, tenho interesse neste imóvel. Aguardo o contato. Obrigado.',
  temperature: 'Alta',
  transactionType: 'SELL',
  extraData: {
    leadCerto: true,
    izi: 'Visualize o histórico de mensagem do cliente com IZI: https://lead-conversation.grupozap.com/lead/59ee0fc6e4b043e1b2a6d863',
    feedback: 'Avalie a temperatura do lead',
    leadType: 'CONTACT_CHAT',
  },
};

/** Exemplo oficial de lead de simulação MCMV: sem anúncio. */
export const OFFICIAL_MCMV_LEAD = {
  leadOrigin: 'MCMV_OLX',
  timestamp: '2026-07-10T10:15:30.000Z',
  originLeadId: 'mcmv-1234567890',
  name: 'João da Silva',
  email: 'joao.silva@example.com',
  ddd: '11',
  phone: '987654321',
  message: 'Simulação de financiamento MCMV realizada no portal.',
  temperature: 'Média',
  transactionType: 'SELL',
  extraData: {
    mcmv: {
      sellerDocument: '12345678000190',
      unitType: 'APARTMENT',
      propertyLocation: { state: 'SP', city: 'São Paulo' },
      propertyValue: 250000,
      subsidyRange: 'FAIXA_1',
    },
  },
};

describe('Basic Auth do webhook do Grupo OLX (ADR-108)', () => {
  it('aceita a chave certa, como o exemplo oficial (vivareal:<chave>)', () => {
    expect(
      verifyGrupoOlxAuthorization(
        'Basic dml2YXJlYWw6NTk0RjgwM0IzODBBNDEzOTZFRDYzRENBMzk1MDM1NDI=',
        SECRET,
      ),
    ).toBe('OK');
    expect(verifyGrupoOlxAuthorization(grupoOlxAuthorizationHeader(SECRET), SECRET)).toBe('OK');
  });

  it('chave errada, cabeçalho ausente ou malformado não passam', () => {
    expect(verifyGrupoOlxAuthorization(grupoOlxAuthorizationHeader('outra-chave'), SECRET)).toBe(
      'INVALID',
    );
    expect(verifyGrupoOlxAuthorization(undefined, SECRET)).toBe('MISSING');
    expect(verifyGrupoOlxAuthorization('', SECRET)).toBe('MISSING');
    expect(verifyGrupoOlxAuthorization('Bearer abc', SECRET)).toBe('INVALID');
    expect(
      verifyGrupoOlxAuthorization(
        `Basic ${Buffer.from('sem-dois-pontos').toString('base64')}`,
        SECRET,
      ),
    ).toBe('INVALID');
    expect(verifyGrupoOlxAuthorization('Basic !!!', SECRET)).toBe('INVALID');
  });

  it('é a chave que autentica: usuário diferente com a chave certa passa', () => {
    const header = `Basic ${Buffer.from(`outro:${SECRET}`).toString('base64')}`;
    expect(verifyGrupoOlxAuthorization(header, SECRET)).toBe('OK');
  });
});

describe('lead do Grupo OLX (ADR-108)', () => {
  it('exemplo oficial lido e normalizado', () => {
    const lead = normalizeGrupoOlxLead(grupoOlxLeadPayloadSchema.parse(OFFICIAL_LEAD));
    expect(lead).toEqual({
      originLeadId: '59ee0fc6e4b043e1b2a6d863',
      kind: 'LISTING',
      clientListingId: 'a40171',
      originListingId: '87027856',
      name: 'Nome Consumidor',
      email: 'nome.consumidor@email.com',
      phone: '11999999999',
      message: OFFICIAL_LEAD.message,
      temperature: 'Alta',
      purpose: 'SALE',
      leadType: 'CONTACT_CHAT',
      leadCerto: true,
      sellerDocument: null,
      receivedAt: '2017-10-23T15:50:30.619Z',
    });
  });

  it('lead MCMV sem anúncio, com o documento do anunciante', () => {
    const lead = normalizeGrupoOlxLead(grupoOlxLeadPayloadSchema.parse(OFFICIAL_MCMV_LEAD));
    expect(lead.kind).toBe('MCMV');
    expect(lead.clientListingId).toBeNull();
    expect(lead.sellerDocument).toBe('12345678000190');
  });

  it('todos os tipos documentados, inclusive CLICK_SCHEDULE, e campo novo desconhecido', () => {
    for (const leadType of [
      'CLICK_SCHEDULE',
      'CLICK_WHATSAPP',
      'CONTACT_CHAT',
      'CONTACT_FORM',
      'PHONE_VIEW',
      'VISIT_REQUEST',
    ]) {
      const payload = {
        ...OFFICIAL_LEAD,
        campoNovoDoPortal: { qualquer: 'coisa' },
        extraData: { ...OFFICIAL_LEAD.extraData, leadType, outroCampoNovo: 1 },
      };
      const parsed = grupoOlxLeadPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`${leadType} recusado: ${parsed.error.message}`);
      }
      expect(normalizeGrupoOlxLead(parsed.data).leadType).toBe(leadType);
    }
  });

  it('sem originLeadId não há como deduplicar: payload recusado', () => {
    const { originLeadId: _ignorado, ...semId } = OFFICIAL_LEAD;
    expect(grupoOlxLeadPayloadSchema.safeParse(semId).success).toBe(false);
  });

  it('telefone: DDD + número; o phoneNumber antigo só quando os dois faltam', () => {
    const soAntigo = normalizeGrupoOlxLead(
      grupoOlxLeadPayloadSchema.parse({ ...OFFICIAL_LEAD, ddd: null, phone: null }),
    );
    expect(soAntigo.phone).toBe('11999999999');
    const nenhum = normalizeGrupoOlxLead(
      grupoOlxLeadPayloadSchema.parse({
        ...OFFICIAL_LEAD,
        ddd: null,
        phone: null,
        phoneNumber: null,
      }),
    );
    expect(nenhum.phone).toBeNull();
    expect(
      normalizeGrupoOlxLead(
        grupoOlxLeadPayloadSchema.parse({ ...OFFICIAL_LEAD, transactionType: 'RENT' }),
      ).purpose,
    ).toBe('RENT');
  });
});

describe('relatório de importação do Grupo OLX (ADR-108)', () => {
  /** O exemplo oficial, com as vírgulas sobrando corrigidas (o da página não é JSON válido). */
  const relatorio = {
    id: '625190f0-8b5a-4866-8eb2-0167d71a09a4',
    company: 'VIVAREAL',
    type: 'FEEDS_INTEGRATION_REPORT',
    description: 'A Simple Description Provided by ZAP+',
    details: {
      date: '2020-09-30T19:21:13',
      total: 200,
      updated: 1886,
      created: 0,
      deleted: 0,
      unchanged: 0,
      error: 134,
      warning: 0,
    },
    link: 'http://grupozap.com.br/report.html',
    errors: [
      {
        errorMessage: 'O campo preços deve estar entre 200 e 900000',
        externalIds: ['AP0511 ', 'SO1009'],
        listingsQuantity: 6,
      },
      {
        errorMessage: 'O campo imagens é obrigatório',
        externalIds: ['LO0666'],
        listingsQuantity: '2',
      },
    ],
    warnings: [
      {
        message: 'O campo videoTourLink não é um link válido',
        externalIds: ['AP0511'],
        listingsQuantity: 3,
      },
    ],
    campoNovo: true,
  };

  it('lê o exemplo oficial: totais, críticas, ids sem espaço e número que vem como texto', () => {
    const normalizado = normalizeGrupoOlxReport(grupoOlxReportPayloadSchema.parse(relatorio));
    expect(normalizado.externalReportId).toBe('625190f0-8b5a-4866-8eb2-0167d71a09a4');
    expect(normalizado.contracted).toBe(200);
    expect(normalizado.errorCount).toBe(134);
    expect(normalizado.errors[0]).toEqual({
      message: 'O campo preços deve estar entre 200 e 900000',
      externalIds: ['AP0511', 'SO1009'],
    });
    expect(normalizado.warnings[0]?.message).toBe('O campo videoTourLink não é um link válido');
    expect(normalizado.externalIds.sort()).toEqual(['AP0511', 'LO0666', 'SO1009']);
    expect(normalizado.reportDate?.toISOString()).toBe('2020-09-30T22:21:13.000Z');
  });

  it('data sem fuso é horário de Brasília; com fuso, vale o fuso', () => {
    expect(parseGrupoOlxReportDate('2026-10-01T09:00:00')?.toISOString()).toBe(
      '2026-10-01T12:00:00.000Z',
    );
    expect(parseGrupoOlxReportDate('2026-10-01T09:00:00Z')?.toISOString()).toBe(
      '2026-10-01T09:00:00.000Z',
    );
    expect(parseGrupoOlxReportDate('lixo')).toBeNull();
    expect(parseGrupoOlxReportDate(null)).toBeNull();
  });

  it('sem id não há como deduplicar: relatório recusado', () => {
    const { id: _ignorado, ...semId } = relatorio;
    expect(grupoOlxReportPayloadSchema.safeParse(semId).success).toBe(false);
  });
});
