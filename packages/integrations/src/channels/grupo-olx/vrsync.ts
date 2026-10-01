import type {
  GrupoOlxDisplayAddress,
  GrupoOlxListingIssue,
  GrupoOlxPropertyType,
  GrupoOlxPublicationTier,
} from '@aluguei/contracts';
import {
  ALLOWED_PORTAL_PROPERTY_TYPES,
  BATHROOMS_REQUIRED,
  BEDROOMS_REQUIRED,
  DEFAULT_PORTAL_PROPERTY_TYPE,
  LOT_AREA_TYPES,
  STATE_NAMES,
  mapFeature,
  ownValue,
  resolveStateAbbreviation,
} from './mapping.js';
import { cdata, element, escapeXmlAttribute, renderAttributes } from './xml.js';

/**
 * Feed VRSync do Grupo OLX (ADR-107): avaliação de cada anúncio contra as regras documentadas e
 * escrita do XML. Puro, sem banco e sem rede — quem carrega os dados é a API.
 * Regras: developers.grupozap.com/feeds (conferido em 01/10/2026). O XSD oficial respondeu 403
 * nessa data; a validação aqui segue as regras escritas e os exemplos oficiais.
 */

export const VRSYNC_NAMESPACE = 'http://www.vivareal.com/schemas/1.0/VRSync';
export const VRSYNC_SCHEMA_LOCATION = `${VRSYNC_NAMESPACE} http://xml.vivareal.com/vrsync.xsd`;
/** Limite da documentação por arquivo. */
export const VRSYNC_MAX_LISTINGS = 50_000;
/** "O tamanho máximo de uma imagem deve ser de 7Mb": lido no sentido mais estrito (decimal). */
export const VRSYNC_MAX_IMAGE_BYTES = 7_000_000;
export const VRSYNC_MIN_IMAGES = 5;
/** Nome do software no cabeçalho do arquivo. */
export const VRSYNC_PROVIDER_NAME = 'AchouImóvel Gestão';

export interface VrsyncPhoto {
  id: string;
  /** URL absoluta e estável da foto para o robô (muda quando o conteúdo muda). */
  url: string;
  /** O formato só aparece na extensão da chave: `mime_type` não é gravado na confirmação. */
  storageKey: string;
  sizeBytes: number | null;
  caption: string | null;
  isCover: boolean;
}

export interface VrsyncAddress {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  lat: number | null;
  lng: number | null;
}

export interface VrsyncListingInput {
  listingId: string;
  listingStatus: string;
  title: string;
  description: string | null;
  propertyType: string;
  portalPropertyType: GrupoOlxPropertyType | null;
  purpose: string;
  monthlyRentCents: number | null;
  salePriceCents: number | null;
  condoFeeCents: number | null;
  /** Mensal no AchouImóvel (o portal soma no total do mês). */
  iptuCents: number | null;
  builtAreaSqm: number | null;
  totalAreaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  suites: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
  features: readonly string[];
  /** Endereço completo (linha privada, com a pública preenchendo o que faltar). */
  address: VrsyncAddress | null;
  /** Na ordem da galeria. */
  photos: readonly VrsyncPhoto[];
  publicationTier: GrupoOlxPublicationTier;
}

export interface VrsyncAgency {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface VrsyncContext {
  agency: VrsyncAgency;
  displayAddress: GrupoOlxDisplayAddress;
}

export interface VrsyncEvaluation {
  eligible: boolean;
  /** Bloqueios e avisos, nesta ordem de leitura. */
  issues: GrupoOlxListingIssue[];
}

const HTML_TAG = /<\/?[a-z][^>]*>/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blocking(code: string, message: string): GrupoOlxListingIssue {
  return { code, message, blocking: true };
}

function warning(code: string, message: string): GrupoOlxListingIssue {
  return { code, message, blocking: false };
}

function isJpeg(storageKey: string): boolean {
  return /\.jpe?g$/i.test(storageKey);
}

/** Opções de tipo no portal para o tipo do AchouImóvel (para a tela e para validar a escolha). */
export function portalPropertyTypeOptions(propertyType: string): {
  defaultType: GrupoOlxPropertyType | null;
  options: readonly GrupoOlxPropertyType[];
} {
  return {
    defaultType: ownValue(DEFAULT_PORTAL_PROPERTY_TYPE, propertyType) ?? null,
    options: ownValue(ALLOWED_PORTAL_PROPERTY_TYPES, propertyType) ?? [],
  };
}

/** Tipo efetivo no portal: a escolha compatível da imobiliária, ou o padrão do tipo. */
export function resolvePortalPropertyType(
  propertyType: string,
  choice: GrupoOlxPropertyType | null,
): GrupoOlxPropertyType | null {
  const { defaultType, options } = portalPropertyTypeOptions(propertyType);
  if (choice !== null) {
    return options.includes(choice) ? choice : null;
  }
  return defaultType;
}

/** Valor em centavos → reais inteiros, como o VRSync pede ("casas decimais desconsideradas"). */
export function toWholeReais(cents: number): number {
  return Math.floor(cents / 100);
}

/** Área em m² → inteiro, sem as casas decimais. */
function wholeArea(value: number | null): number | null {
  return value === null ? null : Math.floor(value);
}

function validPhotos(photos: readonly VrsyncPhoto[]): VrsyncPhoto[] {
  return photos.filter(
    (photo) =>
      isJpeg(photo.storageKey) &&
      photo.sizeBytes !== null &&
      photo.sizeBytes <= VRSYNC_MAX_IMAGE_BYTES,
  );
}

function formatPostalCode(value: string | null): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null;
}

/** Telefone só com dígitos → "(11) 3150-4646" / "(11) 99999-9999". */
export function formatPhone(value: string | null): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return digits === '' ? null : digits;
}

function present(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== '';
}

/** Avalia um anúncio contra as regras do VRSync. Bloqueio tira do feed; aviso não. */
export function evaluateVrsyncListing(
  input: VrsyncListingInput,
  context: VrsyncContext,
): VrsyncEvaluation {
  const issues: GrupoOlxListingIssue[] = [];

  if (input.listingStatus !== 'PUBLISHED') {
    issues.push(
      blocking('LISTING_NOT_PUBLISHED', 'O anúncio precisa estar publicado no AchouImóvel.'),
    );
  }

  if (!present(context.agency.email) || !EMAIL.test(context.agency.email.trim())) {
    issues.push(
      blocking(
        'CONTACT_EMAIL_MISSING',
        'Cadastre o e-mail público da imobiliária: o Grupo OLX exige e-mail no contato do anúncio.',
      ),
    );
  }

  const title = input.title.trim();
  if (title.length < 10 || title.length > 100) {
    issues.push(
      blocking(
        'TITLE_LENGTH',
        `O título precisa ter de 10 a 100 caracteres no Grupo OLX (tem ${String(title.length)}).`,
      ),
    );
  }
  if (HTML_TAG.test(title)) {
    issues.push(blocking('TITLE_HTML', 'O título não pode ter marcação HTML.'));
  }

  const description = (input.description ?? '').trim();
  if (description === '') {
    issues.push(
      blocking(
        'DESCRIPTION_MISSING',
        'O Grupo OLX exige descrição no anúncio (50 a 3.000 caracteres).',
      ),
    );
  } else if (description.length < 50 || description.length > 3000) {
    issues.push(
      blocking(
        'DESCRIPTION_LENGTH',
        `A descrição precisa ter de 50 a 3.000 caracteres no Grupo OLX (tem ${String(description.length)}).`,
      ),
    );
  }
  if (HTML_TAG.test(description)) {
    issues.push(blocking('DESCRIPTION_HTML', 'A descrição não pode ter marcação HTML.'));
  }

  const needsRent = input.purpose === 'RENT' || input.purpose === 'BOTH';
  const needsSale = input.purpose === 'SALE' || input.purpose === 'BOTH';
  if (input.purpose !== 'RENT' && input.purpose !== 'SALE' && input.purpose !== 'BOTH') {
    issues.push(blocking('PURPOSE_UNKNOWN', 'Finalidade do imóvel desconhecida.'));
  }
  if (needsRent && (input.monthlyRentCents === null || toWholeReais(input.monthlyRentCents) < 1)) {
    issues.push(blocking('RENT_PRICE_MISSING', 'Informe o valor do aluguel.'));
  }
  if (needsSale && (input.salePriceCents === null || toWholeReais(input.salePriceCents) < 1)) {
    issues.push(blocking('SALE_PRICE_MISSING', 'Informe o valor de venda.'));
  }
  const fractional = [
    needsRent ? input.monthlyRentCents : null,
    needsSale ? input.salePriceCents : null,
    input.condoFeeCents,
    input.iptuCents,
  ].some((cents) => cents !== null && cents % 100 !== 0);
  if (fractional) {
    issues.push(
      warning(
        'PRICE_CENTS_DROPPED',
        'O VRSync só aceita reais inteiros: os centavos dos valores não vão para o portal.',
      ),
    );
  }

  const portalType = resolvePortalPropertyType(input.propertyType, input.portalPropertyType);
  if (portalType === null) {
    issues.push(
      input.portalPropertyType === null
        ? blocking(
            'PORTAL_PROPERTY_TYPE_REQUIRED',
            'Escolha o tipo do imóvel no Grupo OLX: comercial e terreno têm mais de uma opção.',
          )
        : blocking(
            'PORTAL_PROPERTY_TYPE_INVALID',
            'O tipo escolhido para o Grupo OLX não combina com o tipo do imóvel.',
          ),
    );
  } else {
    const isKitnet = portalType === 'Residential / Kitnet';
    if (BEDROOMS_REQUIRED.has(portalType) && input.bedrooms === null) {
      issues.push(blocking('BEDROOMS_REQUIRED', 'Informe o número de quartos.'));
    }
    if (portalType === 'Residential / Studio' && input.bedrooms !== null && input.bedrooms < 1) {
      issues.push(
        blocking(
          'STUDIO_BEDROOMS',
          'Studio no Grupo OLX tem ao menos 1 quarto; se for kitnet, escolha Kitnet como tipo.',
        ),
      );
    }
    if (isKitnet && input.bedrooms !== null && input.bedrooms !== 0) {
      issues.push(blocking('KITNET_BEDROOMS', 'Kitnet no Grupo OLX tem 0 quartos.'));
    }
    if (BATHROOMS_REQUIRED.has(portalType) && input.bathrooms === null) {
      issues.push(blocking('BATHROOMS_REQUIRED', 'Informe o número de banheiros.'));
    }
    if (LOT_AREA_TYPES.has(portalType)) {
      if ((wholeArea(input.totalAreaSqm) ?? 0) < 1) {
        issues.push(blocking('LOT_AREA_REQUIRED', 'Informe a área total do imóvel.'));
      }
    } else if ((wholeArea(input.builtAreaSqm) ?? 0) < 1) {
      issues.push(
        blocking(
          'LIVING_AREA_REQUIRED',
          'Informe a área construída: ela vai como área útil, obrigatória no Grupo OLX.',
        ),
      );
    }
  }

  const address = input.address;
  const state = resolveStateAbbreviation(address?.state ?? null);
  if (state === null) {
    issues.push(blocking('ADDRESS_STATE', 'Informe a UF do endereço.'));
  }
  if (!present(address?.city)) {
    issues.push(blocking('ADDRESS_CITY', 'Informe a cidade do endereço.'));
  }
  if (!present(address?.neighborhood)) {
    issues.push(blocking('ADDRESS_NEIGHBORHOOD', 'Informe o bairro do endereço.'));
  }
  if (formatPostalCode(address?.zipCode ?? null) === null) {
    issues.push(blocking('POSTAL_CODE', 'Informe o CEP do imóvel (8 dígitos): o Grupo OLX exige.'));
  }

  const usable = validPhotos(input.photos);
  const notJpeg = input.photos.filter((photo) => !isJpeg(photo.storageKey)).length;
  const tooBig = input.photos.filter(
    (photo) => isJpeg(photo.storageKey) && (photo.sizeBytes ?? 0) > VRSYNC_MAX_IMAGE_BYTES,
  ).length;
  if (notJpeg > 0) {
    issues.push(
      warning(
        'PHOTO_NOT_JPEG',
        `${String(notJpeg)} foto(s) em PNG ou WebP ficam fora: o Grupo OLX só importa JPG.`,
      ),
    );
  }
  if (tooBig > 0) {
    issues.push(
      warning(
        'PHOTO_TOO_LARGE',
        `${String(tooBig)} foto(s) acima de 7 MB ficam fora do Grupo OLX.`,
      ),
    );
  }
  if (usable.length < VRSYNC_MIN_IMAGES) {
    issues.push(
      blocking(
        'PHOTOS_MIN',
        `O Grupo OLX exige ao menos ${String(VRSYNC_MIN_IMAGES)} fotos JPG de até 7 MB (este anúncio tem ${String(usable.length)}).`,
      ),
    );
  }

  const unmapped = input.features.filter((feature) => mapFeature(feature) === null);
  if (unmapped.length > 0) {
    issues.push(
      warning(
        'FEATURES_UNMAPPED',
        `Características sem correspondência no Grupo OLX ficam fora: ${unmapped.join(', ')}.`,
      ),
    );
  }

  return { eligible: !issues.some((issue) => issue.blocking), issues };
}

/** Data e hora de São Paulo sem fuso, como no exemplo oficial do cabeçalho. */
export function saoPauloLocalDateTime(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Abertura do arquivo: declaração, raiz com os namespaces oficiais, cabeçalho e `<Listings>`. */
export function renderVrsyncDocumentStart(agency: VrsyncAgency, publishedAt: Date): string {
  const header = [
    element('Provider', VRSYNC_PROVIDER_NAME),
    element('Email', present(agency.email) ? agency.email.trim() : null),
    element('ContactName', agency.name),
    element('PublishDate', saoPauloLocalDateTime(publishedAt)),
    element('Telephone', formatPhone(agency.phone)),
  ].join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<ListingDataFeed xmlns="${VRSYNC_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${escapeXmlAttribute(VRSYNC_SCHEMA_LOCATION)}">\n` +
    `<Header>${header}</Header>\n<Listings>\n`
  );
}

export function renderVrsyncDocumentEnd(): string {
  return '</Listings>\n</ListingDataFeed>\n';
}

function transactionType(purpose: string): string {
  if (purpose === 'SALE') return 'For Sale';
  if (purpose === 'BOTH') return 'Sale/Rent';
  return 'For Rent';
}

/** Descrição em CDATA, com quebra de linha no formato que a documentação pede (`&lt;br&gt;`). */
function descriptionCdata(description: string): string {
  return cdata(description.trim().replace(/\r\n?/g, '\n').replaceAll('\n', '&lt;br&gt;\n'));
}

function renderMedia(photos: readonly VrsyncPhoto[]): string {
  const usable = validPhotos(photos);
  const primary = usable.find((photo) => photo.isCover) ?? usable[0];
  const items = usable.map((photo) => {
    const attributes: Record<string, string> = { medium: 'image' };
    if (present(photo.caption)) attributes.caption = photo.caption.trim();
    if (photo === primary) attributes.primary = 'true';
    return element('Item', photo.url, attributes);
  });
  return `<Media>${items.join('')}</Media>`;
}

function renderFeatures(input: VrsyncListingInput): string {
  const mapped = new Set<string>();
  for (const feature of input.features) {
    const value = mapFeature(feature);
    if (value !== null) mapped.add(value);
  }
  if (input.furnished) mapped.add('Furnished');
  if (input.petsAllowed === true) mapped.add('Pets Allowed');
  if (mapped.size === 0) return '';
  return `<Features>${[...mapped].map((value) => element('Feature', value)).join('')}</Features>`;
}

function renderDetails(input: VrsyncListingInput, portalType: GrupoOlxPropertyType): string {
  const brl = { currency: 'BRL' };
  const needsRent = input.purpose === 'RENT' || input.purpose === 'BOTH';
  const needsSale = input.purpose === 'SALE' || input.purpose === 'BOTH';
  const lotArea = wholeArea(input.totalAreaSqm);
  const livingArea = wholeArea(input.builtAreaSqm);
  const isKitnet = portalType === 'Residential / Kitnet';
  const parts = [
    element('UsageType', portalType.startsWith('Commercial') ? 'Commercial' : 'Residential'),
    element('PropertyType', portalType),
    `<Description>${descriptionCdata(input.description ?? '')}</Description>`,
    needsSale && input.salePriceCents !== null
      ? element('ListPrice', toWholeReais(input.salePriceCents), brl)
      : '',
    needsRent && input.monthlyRentCents !== null
      ? element('RentalPrice', toWholeReais(input.monthlyRentCents), { ...brl, period: 'Monthly' })
      : '',
    lotArea !== null && lotArea >= 1 ? element('LotArea', lotArea, { unit: 'square metres' }) : '',
    livingArea !== null && livingArea >= 1
      ? element('LivingArea', livingArea, { unit: 'square metres' })
      : '',
    input.condoFeeCents !== null
      ? element('PropertyAdministrationFee', toWholeReais(input.condoFeeCents), brl)
      : '',
    input.iptuCents !== null
      ? element('Iptu', toWholeReais(input.iptuCents), { ...brl, period: 'Monthly' })
      : '',
    element('Bedrooms', isKitnet ? (input.bedrooms ?? 0) : input.bedrooms),
    element('Bathrooms', input.bathrooms),
    element('Suites', input.suites),
    element('Garage', input.parkingSpots, { type: 'Parking Space' }),
    renderFeatures(input),
  ];
  return `<Details>${parts.join('')}</Details>`;
}

function renderLocation(address: VrsyncAddress, displayAddress: GrupoOlxDisplayAddress): string {
  const state = resolveStateAbbreviation(address.state);
  const parts = [
    element('Country', 'Brasil', { abbreviation: 'BR' }),
    state === null
      ? ''
      : element('State', ownValue(STATE_NAMES, state) ?? state, { abbreviation: state }),
    element('City', address.city?.trim() ?? null),
    element('Neighborhood', address.neighborhood?.trim() ?? null),
    present(address.street) ? element('Address', address.street.trim()) : '',
    present(address.number) ? element('StreetNumber', address.number.trim()) : '',
    present(address.complement) ? element('Complement', address.complement.trim()) : '',
    element('PostalCode', formatPostalCode(address.zipCode)),
    address.lat !== null && address.lng !== null ? element('Latitude', address.lat.toFixed(7)) : '',
    address.lat !== null && address.lng !== null
      ? element('Longitude', address.lng.toFixed(7))
      : '',
  ];
  return `<Location${renderAttributes({ displayAddress })}>${parts.join('')}</Location>`;
}

function renderContact(agency: VrsyncAgency): string {
  const parts = [
    element('Name', agency.name),
    element('Email', present(agency.email) ? agency.email.trim() : null),
    element('Telephone', formatPhone(agency.phone)),
  ];
  return `<ContactInfo>${parts.join('')}</ContactInfo>`;
}

/**
 * Trecho `<Listing>` de um anúncio **já avaliado como elegível**. Chamado com anúncio inválido,
 * recusa em vez de escrever um trecho que o portal rejeitaria.
 */
export function renderVrsyncListing(input: VrsyncListingInput, context: VrsyncContext): string {
  const portalType = resolvePortalPropertyType(input.propertyType, input.portalPropertyType);
  if (portalType === null || input.address === null) {
    throw new Error(`anúncio ${input.listingId} não é elegível para o feed VRSync`);
  }
  return [
    '<Listing>',
    element('ListingID', input.listingId),
    `<Title>${cdata(input.title.trim())}</Title>`,
    element('TransactionType', transactionType(input.purpose)),
    element('PublicationType', input.publicationTier),
    renderMedia(input.photos),
    renderDetails(input, portalType),
    renderLocation(input.address, context.displayAddress),
    renderContact(context.agency),
    '</Listing>\n',
  ].join('');
}
