import { DOMParser } from '@xmldom/xmldom';
import type { Document } from '@xmldom/xmldom';
import { parser as saxParser } from 'sax';
import { describe, expect, it } from 'vitest';
import { grupoOlxPropertyTypeSchema } from '@aluguei/contracts';
import { ALLOWED_PORTAL_PROPERTY_TYPES, mapFeature } from './mapping.js';
import {
  VRSYNC_NAMESPACE,
  evaluateVrsyncListing,
  renderVrsyncDocumentEnd,
  renderVrsyncDocumentStart,
  renderVrsyncListing,
  saoPauloLocalDateTime,
  toWholeReais,
} from './vrsync.js';
import type { VrsyncAddress, VrsyncContext, VrsyncListingInput, VrsyncPhoto } from './vrsync.js';

const LISTING_ID = '6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';

function photo(index: number, overrides: Partial<VrsyncPhoto> = {}): VrsyncPhoto {
  return {
    id: `00000000-0000-4000-8000-00000000000${String(index)}`,
    url: `https://api.achouimovel.online/integrations/grupo-olx/media/m${String(index)}/v${String(index)}.jpg`,
    storageKey: `orgs/o/properties/p/photo/${String(index)}.jpg`,
    sizeBytes: 2_000_000,
    caption: index === 1 ? 'Sala' : null,
    isCover: index === 1,
    ...overrides,
  };
}

const ENDERECO: VrsyncAddress = {
  street: 'Rua T-55',
  number: '930',
  complement: 'Apto 804',
  neighborhood: 'Setor Bueno',
  city: 'Goiânia',
  state: 'GO',
  zipCode: '74215170',
  lat: -16.7036,
  lng: -49.2695,
};

function baseInput(overrides: Partial<VrsyncListingInput> = {}): VrsyncListingInput {
  return {
    listingId: LISTING_ID,
    listingStatus: 'PUBLISHED',
    title: 'Apartamento com 2 quartos no Setor Bueno',
    description:
      'Apartamento ventilado, com varanda e duas vagas.\nPerto de escolas, mercados e do parque Vaca Brava.',
    propertyType: 'APARTMENT',
    portalPropertyType: null,
    purpose: 'RENT',
    monthlyRentCents: 280_000,
    salePriceCents: null,
    condoFeeCents: 48_000,
    iptuCents: 13_000,
    builtAreaSqm: 72.5,
    totalAreaSqm: 90,
    bedrooms: 2,
    bathrooms: 2,
    suites: 1,
    parkingSpots: 2,
    furnished: false,
    petsAllowed: true,
    features: ['Piscina', 'churrasqueira', 'Portaria 24h'],
    address: ENDERECO,
    photos: [1, 2, 3, 4, 5].map((index) => photo(index)),
    publicationTier: 'STANDARD',
    ...overrides,
  };
}

const context: VrsyncContext = {
  agency: { name: 'Imobiliária Exemplo', email: 'contato@exemplo.com.br', phone: '62999990000' },
  displayAddress: 'Neighborhood',
};

function codes(input: VrsyncListingInput, ctx: VrsyncContext = context): string[] {
  return evaluateVrsyncListing(input, ctx).issues.map((issue) => issue.code);
}

function blockingCodes(input: VrsyncListingInput, ctx: VrsyncContext = context): string[] {
  return evaluateVrsyncListing(input, ctx)
    .issues.filter((issue) => issue.blocking)
    .map((issue) => issue.code);
}

/**
 * Erros de boa formação no modo estrito do `sax` (entidade inválida, tag trocada). O `xmldom`
 * sozinho aceita um "&" solto, então é o `sax` que serve de portão.
 */
function wellFormednessErrors(xml: string): string[] {
  const errors: string[] = [];
  const parser = saxParser(true, { xmlns: true });
  parser.onerror = (error) => {
    errors.push(error.message.split('\n')[0] ?? error.message);
    parser.error = null;
    parser.resume();
  };
  parser.write(xml).close();
  return errors;
}

/** Documento completo como o feed escreve, conferido no modo estrito e lido como DOM. */
function parseFeed(inputs: VrsyncListingInput[], ctx: VrsyncContext = context): Document {
  const xml =
    renderVrsyncDocumentStart(ctx.agency, new Date('2026-10-01T15:00:00Z')) +
    inputs.map((input) => renderVrsyncListing(input, ctx)).join('') +
    renderVrsyncDocumentEnd();
  expect(wellFormednessErrors(xml), xml.slice(0, 400)).toEqual([]);
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, message) => {
      errors.push(`${level}: ${message}`);
    },
  }).parseFromString(xml, 'text/xml');
  expect(errors, xml.slice(0, 400)).toEqual([]);
  return doc;
}

function text(doc: Document, tag: string, index = 0): string | null {
  return doc.getElementsByTagName(tag).item(index)?.textContent ?? null;
}

describe('avaliação do anúncio para o feed VRSync (ADR-107)', () => {
  it('anúncio completo é elegível, sem bloqueio', () => {
    expect(evaluateVrsyncListing(baseInput(), context)).toEqual({ eligible: true, issues: [] });
  });

  it('título fora de 10–100 caracteres bloqueia, sem truncar', () => {
    expect(blockingCodes(baseInput({ title: 'Apto' }))).toContain('TITLE_LENGTH');
    expect(blockingCodes(baseInput({ title: 'A'.repeat(101) }))).toContain('TITLE_LENGTH');
    expect(blockingCodes(baseInput({ title: 'A'.repeat(100) }))).not.toContain('TITLE_LENGTH');
  });

  it('descrição ausente ou curta bloqueia; nada é inventado no lugar', () => {
    expect(blockingCodes(baseInput({ description: null }))).toContain('DESCRIPTION_MISSING');
    expect(blockingCodes(baseInput({ description: 'Curta demais.' }))).toContain(
      'DESCRIPTION_LENGTH',
    );
    expect(blockingCodes(baseInput({ description: 'x'.repeat(3001) }))).toContain(
      'DESCRIPTION_LENGTH',
    );
  });

  it('HTML no título ou na descrição bloqueia', () => {
    expect(blockingCodes(baseInput({ title: 'Apartamento <b>lindo</b> no centro' }))).toContain(
      'TITLE_HTML',
    );
    expect(
      blockingCodes(
        baseInput({ description: `${'Descrição longa o bastante. '.repeat(3)}<script>` }),
      ),
    ).toContain('DESCRIPTION_HTML');
  });

  it('CEP ausente ou incompleto bloqueia', () => {
    expect(blockingCodes(baseInput({ address: { ...ENDERECO, zipCode: null } }))).toContain(
      'POSTAL_CODE',
    );
    expect(blockingCodes(baseInput({ address: { ...ENDERECO, zipCode: '7421' } }))).toContain(
      'POSTAL_CODE',
    );
  });

  it('tipo comercial ou terreno sem escolha bloqueia; escolha incompatível também', () => {
    expect(blockingCodes(baseInput({ propertyType: 'COMMERCIAL' }))).toContain(
      'PORTAL_PROPERTY_TYPE_REQUIRED',
    );
    expect(blockingCodes(baseInput({ propertyType: 'LAND' }))).toContain(
      'PORTAL_PROPERTY_TYPE_REQUIRED',
    );
    expect(
      blockingCodes(
        baseInput({ propertyType: 'APARTMENT', portalPropertyType: 'Commercial / Office' }),
      ),
    ).toContain('PORTAL_PROPERTY_TYPE_INVALID');
    expect(
      evaluateVrsyncListing(
        baseInput({ propertyType: 'COMMERCIAL', portalPropertyType: 'Commercial / Office' }),
        context,
      ).eligible,
    ).toBe(true);
  });

  it('terreno exige área total; os demais, área construída', () => {
    const terreno = baseInput({
      propertyType: 'LAND',
      portalPropertyType: 'Residential / Land Lot',
      totalAreaSqm: null,
      bedrooms: null,
      bathrooms: null,
    });
    expect(blockingCodes(terreno)).toEqual(['LOT_AREA_REQUIRED']);
    expect(blockingCodes(baseInput({ builtAreaSqm: null }))).toContain('LIVING_AREA_REQUIRED');
    expect(blockingCodes(baseInput({ builtAreaSqm: 0.4 }))).toContain('LIVING_AREA_REQUIRED');
  });

  it('quartos e banheiros obrigatórios conforme o tipo; studio e kitnet com regra própria', () => {
    expect(blockingCodes(baseInput({ bedrooms: null }))).toContain('BEDROOMS_REQUIRED');
    expect(blockingCodes(baseInput({ bathrooms: null }))).toContain('BATHROOMS_REQUIRED');
    expect(blockingCodes(baseInput({ propertyType: 'STUDIO', bedrooms: 0 }))).toContain(
      'STUDIO_BEDROOMS',
    );
    expect(
      blockingCodes(
        baseInput({
          propertyType: 'STUDIO',
          portalPropertyType: 'Residential / Kitnet',
          bedrooms: 1,
        }),
      ),
    ).toContain('KITNET_BEDROOMS');
  });

  it('preço: aluguel sem valor bloqueia; venda e venda/aluguel exigem os valores certos', () => {
    expect(blockingCodes(baseInput({ monthlyRentCents: null }))).toContain('RENT_PRICE_MISSING');
    expect(blockingCodes(baseInput({ monthlyRentCents: 50 }))).toContain('RENT_PRICE_MISSING');
    expect(blockingCodes(baseInput({ purpose: 'SALE', monthlyRentCents: null }))).toContain(
      'SALE_PRICE_MISSING',
    );
    const ambos = blockingCodes(baseInput({ purpose: 'BOTH', salePriceCents: null }));
    expect(ambos).toContain('SALE_PRICE_MISSING');
  });

  it('centavos não vão ao portal: viram aviso, e o valor é truncado como a documentação pede', () => {
    const issues = codes(baseInput({ monthlyRentCents: 280_050 }));
    expect(issues).toContain('PRICE_CENTS_DROPPED');
    expect(toWholeReais(280_050)).toBe(2800);
  });

  it('fotos: 5 JPG passam; 4 bloqueiam; PNG, WebP e JPG acima de 7 MB ficam fora com aviso', () => {
    expect(blockingCodes(baseInput())).not.toContain('PHOTOS_MIN');
    expect(blockingCodes(baseInput({ photos: [1, 2, 3, 4].map((i) => photo(i)) }))).toContain(
      'PHOTOS_MIN',
    );
    const misturadas = baseInput({
      photos: [
        ...[1, 2, 3, 4, 5].map((i) => photo(i)),
        photo(6, { storageKey: 'orgs/o/properties/p/photo/6.png' }),
        photo(7, { storageKey: 'orgs/o/properties/p/photo/7.webp' }),
        photo(8, { sizeBytes: 7_500_000 }),
      ],
    });
    const avaliacao = evaluateVrsyncListing(misturadas, context);
    expect(avaliacao.eligible).toBe(true);
    expect(avaliacao.issues.map((issue) => issue.code)).toEqual([
      'PHOTO_NOT_JPEG',
      'PHOTO_TOO_LARGE',
    ]);
    const so4Jpg = baseInput({
      photos: [
        ...[1, 2, 3, 4].map((i) => photo(i)),
        photo(5, { storageKey: 'orgs/o/properties/p/photo/5.webp' }),
      ],
    });
    expect(blockingCodes(so4Jpg)).toContain('PHOTOS_MIN');
  });

  it('sem e-mail público da imobiliária o ContactInfo fica incompleto e bloqueia', () => {
    const semEmail = { ...context, agency: { ...context.agency, email: null } };
    expect(blockingCodes(baseInput(), semEmail)).toContain('CONTACT_EMAIL_MISSING');
    const invalido = { ...context, agency: { ...context.agency, email: 'contato@' } };
    expect(blockingCodes(baseInput(), invalido)).toContain('CONTACT_EMAIL_MISSING');
  });

  it('anúncio que não está publicado no AchouImóvel não vai ao feed', () => {
    expect(blockingCodes(baseInput({ listingStatus: 'PAUSED' }))).toContain(
      'LISTING_NOT_PUBLISHED',
    );
  });

  it('característica sem correspondência vira aviso, sem bloquear', () => {
    const avaliacao = evaluateVrsyncListing(
      baseInput({ features: ['Piscina', 'Vista para a praça'] }),
      context,
    );
    expect(avaliacao.eligible).toBe(true);
    expect(avaliacao.issues).toEqual([
      expect.objectContaining({ code: 'FEATURES_UNMAPPED', blocking: false }),
    ]);
    expect(avaliacao.issues[0]?.message).toContain('Vista para a praça');
  });
});

describe('XML do feed VRSync (ADR-107)', () => {
  it('o portão de boa formação recusa XML quebrado (controle do próprio teste)', () => {
    expect(wellFormednessErrors('<a>x & y</a>')).not.toEqual([]);
    expect(wellFormednessErrors('<a><b></a>')).not.toEqual([]);
    expect(wellFormednessErrors('<a>x &amp; y</a>')).toEqual([]);
  });

  it('documento bem-formado, com o namespace e o cabeçalho oficiais', () => {
    const doc = parseFeed([baseInput()]);
    const root = doc.documentElement;
    expect(root?.localName).toBe('ListingDataFeed');
    expect(root?.namespaceURI).toBe(VRSYNC_NAMESPACE);
    expect(text(doc, 'Provider')).toBe('AchouImóvel Gestão');
    expect(text(doc, 'Email')).toBe('contato@exemplo.com.br');
    expect(text(doc, 'PublishDate')).toBe('2026-10-01T12:00:00');
    expect(doc.getElementsByTagName('Listing').length).toBe(1);
  });

  it('ListingID é o id estável do anúncio, igual em toda geração', () => {
    const primeira = parseFeed([baseInput()]);
    const segunda = parseFeed([baseInput()]);
    expect(text(primeira, 'ListingID')).toBe(LISTING_ID);
    expect(text(segunda, 'ListingID')).toBe(LISTING_ID);
    expect(renderVrsyncListing(baseInput(), context)).toBe(
      renderVrsyncListing(baseInput(), context),
    );
  });

  it('endereço completo vai ao portal com exibição só do bairro', () => {
    const doc = parseFeed([baseInput()]);
    const location = doc.getElementsByTagName('Location').item(0);
    expect(location?.getAttribute('displayAddress')).toBe('Neighborhood');
    expect(text(doc, 'Address')).toBe('Rua T-55');
    expect(text(doc, 'StreetNumber')).toBe('930');
    expect(text(doc, 'PostalCode')).toBe('74215-170');
    expect(text(doc, 'State')).toBe('Goiás');
    expect(doc.getElementsByTagName('State').item(0)?.getAttribute('abbreviation')).toBe('GO');
    expect(text(doc, 'Latitude')).toBe('-16.7036000');
  });

  it('aluguel: só RentalPrice mensal; condomínio e IPTU mensal em reais inteiros', () => {
    const doc = parseFeed([baseInput({ monthlyRentCents: 280_050 })]);
    expect(text(doc, 'TransactionType')).toBe('For Rent');
    expect(text(doc, 'RentalPrice')).toBe('2800');
    expect(doc.getElementsByTagName('RentalPrice').item(0)?.getAttribute('period')).toBe('Monthly');
    expect(doc.getElementsByTagName('ListPrice').length).toBe(0);
    expect(text(doc, 'PropertyAdministrationFee')).toBe('480');
    expect(text(doc, 'Iptu')).toBe('130');
    expect(doc.getElementsByTagName('Iptu').item(0)?.getAttribute('period')).toBe('Monthly');
  });

  it('venda: só ListPrice; venda e aluguel: os dois, como Sale/Rent', () => {
    const venda = parseFeed([
      baseInput({ purpose: 'SALE', monthlyRentCents: null, salePriceCents: 86_000_000 }),
    ]);
    expect(text(venda, 'TransactionType')).toBe('For Sale');
    expect(text(venda, 'ListPrice')).toBe('860000');
    expect(venda.getElementsByTagName('RentalPrice').length).toBe(0);
    const ambos = parseFeed([baseInput({ purpose: 'BOTH', salePriceCents: 86_000_000 })]);
    expect(text(ambos, 'TransactionType')).toBe('Sale/Rent');
    expect(text(ambos, 'ListPrice')).toBe('860000');
    expect(text(ambos, 'RentalPrice')).toBe('2800');
  });

  it('fotos: só JPG válidos, uma única principal (a capa), na ordem da galeria', () => {
    const doc = parseFeed([
      baseInput({
        photos: [
          photo(2),
          photo(1),
          photo(3),
          photo(9, { storageKey: 'orgs/o/properties/p/photo/9.png' }),
          photo(4),
          photo(5),
        ],
      }),
    ]);
    const items = Array.from({ length: doc.getElementsByTagName('Item').length }, (_, i) =>
      doc.getElementsByTagName('Item').item(i),
    );
    expect(items).toHaveLength(5);
    expect(items.filter((item) => item?.getAttribute('primary') === 'true')).toHaveLength(1);
    expect(items[1]?.getAttribute('primary')).toBe('true');
    expect(items[0]?.textContent).toContain('/m2/');
    expect(items.every((item) => item?.getAttribute('medium') === 'image')).toBe(true);
  });

  it('tipo, uso, áreas inteiras, suítes, garagem e características mapeadas', () => {
    const doc = parseFeed([baseInput({ furnished: true })]);
    expect(text(doc, 'UsageType')).toBe('Residential');
    expect(text(doc, 'PropertyType')).toBe('Residential / Apartment');
    expect(text(doc, 'LivingArea')).toBe('72');
    expect(text(doc, 'LotArea')).toBe('90');
    expect(text(doc, 'Suites')).toBe('1');
    expect(text(doc, 'Garage')).toBe('2');
    const features = Array.from(
      { length: doc.getElementsByTagName('Feature').length },
      (_, i) => doc.getElementsByTagName('Feature').item(i)?.textContent,
    );
    expect(features).toEqual(['Pool', 'BBQ', 'Concierge 24h', 'Furnished', 'Pets Allowed']);
    const comercial = parseFeed([
      baseInput({ propertyType: 'COMMERCIAL', portalPropertyType: 'Commercial / Office' }),
    ]);
    expect(text(comercial, 'UsageType')).toBe('Commercial');
  });

  it('CDATA protege título e descrição, inclusive com "]]>" e caracteres especiais', () => {
    const titulo = 'Casa & quintal <grande> ]]> "boa" — 3 quartos 🏡';
    const descricao =
      'Linha 1 com & e < e > e "aspas".\nLinha 2 com ]]> no meio e emoji 🏡 e acento à é ç.\u0007';
    const doc = parseFeed([baseInput({ title: titulo, description: descricao, features: [] })]);
    expect(text(doc, 'Title')).toBe(titulo);
    expect(text(doc, 'Description')).toBe(
      'Linha 1 com & e < e > e "aspas".&lt;br&gt;\nLinha 2 com ]]> no meio e emoji 🏡 e acento à é ç.',
    );
  });

  it('texto com marcação e aspas em atributo e elemento sai escapado', () => {
    const doc = parseFeed([
      baseInput({
        photos: [1, 2, 3, 4, 5].map((i) =>
          photo(i, { caption: i === 2 ? 'Sala "A" & <B>' : null }),
        ),
      }),
    ]);
    expect(doc.getElementsByTagName('Item').item(1)?.getAttribute('caption')).toBe(
      'Sala "A" & <B>',
    );
  });

  it('PublishDate é o horário de São Paulo, sem fuso, como no exemplo oficial', () => {
    expect(saoPauloLocalDateTime(new Date('2026-01-15T02:30:05Z'))).toBe('2026-01-14T23:30:05');
  });

  // O teste tem o próprio teto (90 s, folga larga para CI carregada; o robô dá 20 minutos de
  // download): o limite padrão de 5 s do vitest estourava com a suíte inteira rodando em paralelo.
  it(
    'escrever 50 mil anúncios cabe no tempo de uma busca (sem montar o arquivo na memória)',
    { timeout: 90_000 },
    () => {
      const inicio = performance.now();
      let bytes = 0;
      for (let i = 0; i < 50_000; i += 1) {
        bytes += renderVrsyncListing(baseInput({ listingId: `id-${String(i)}` }), context).length;
      }
      const segundos = (performance.now() - inicio) / 1000;
      expect(bytes).toBeGreaterThan(50_000 * 1000);
      expect(segundos).toBeLessThan(60);
    },
  );
});

describe('tabelas de correspondência (ADR-107)', () => {
  it('toda escolha permitida é um PropertyType oficial', () => {
    const oficiais = new Set<string>(grupoOlxPropertyTypeSchema.options);
    for (const opcoes of Object.values(ALLOWED_PORTAL_PROPERTY_TYPES)) {
      for (const opcao of opcoes) {
        expect(oficiais.has(opcao), opcao).toBe(true);
      }
    }
  });

  it('nome que existe no protótipo não vira característica nem tipo (revisão de segurança)', () => {
    for (const termo of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(mapFeature(termo), termo).toBeNull();
    }
    const xml = renderVrsyncListing(baseInput({ features: ['constructor', 'Piscina'] }), context);
    expect(xml).not.toContain('function');
    expect(xml).toContain('<Feature>Pool</Feature>');
    expect(
      evaluateVrsyncListing(baseInput({ propertyType: 'constructor' }), context).issues.map(
        (issue) => issue.code,
      ),
    ).toContain('PORTAL_PROPERTY_TYPE_REQUIRED');
  });

  it('característica em texto livre casa sem acento nem caixa', () => {
    expect(mapFeature('  Salão de Festas ')).toBe('Party Room');
    expect(mapFeature('ar-condicionado')).toBe('Cooling');
    expect(mapFeature('Wi-Fi')).toBe('Internet Connection');
    expect(mapFeature('heliporto')).toBeNull();
  });
});
