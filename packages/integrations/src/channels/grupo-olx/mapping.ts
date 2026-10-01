import type { GrupoOlxPropertyType } from '@aluguei/contracts';

/**
 * Tabelas de correspondência AchouImóvel → VRSync (ADR-107). Tudo explícito: tipo ambíguo não é
 * adivinhado — a imobiliária escolhe, e sem escolha o anúncio fica fora do feed com o motivo.
 * Fonte das regras: developers.grupozap.com/feeds/vrsync/elements/details.html (01/10/2026).
 */

/** Tipo do VRSync quando o tipo do AchouImóvel decide sozinho; nulo = precisa de escolha. */
export const DEFAULT_PORTAL_PROPERTY_TYPE: Record<string, GrupoOlxPropertyType | null> = {
  APARTMENT: 'Residential / Apartment',
  HOUSE: 'Residential / Home',
  HOUSE_CONDO: 'Residential / Condo',
  TOWNHOUSE: 'Residential / Sobrado',
  STUDIO: 'Residential / Studio',
  PENTHOUSE: 'Residential / Penthouse',
  COMMERCIAL: null,
  LAND: null,
};

/** Escolhas compatíveis com cada tipo do AchouImóvel (a primeira, quando há, é o padrão). */
export const ALLOWED_PORTAL_PROPERTY_TYPES: Record<string, readonly GrupoOlxPropertyType[]> = {
  APARTMENT: [
    'Residential / Apartment',
    'Residential / Flat',
    'Residential / Kitnet',
    'Residential / Loft',
  ],
  HOUSE: ['Residential / Home', 'Residential / Village House', 'Residential / Sobrado'],
  HOUSE_CONDO: ['Residential / Condo'],
  TOWNHOUSE: ['Residential / Sobrado'],
  STUDIO: ['Residential / Studio', 'Residential / Kitnet', 'Residential / Loft'],
  PENTHOUSE: ['Residential / Penthouse'],
  COMMERCIAL: [
    'Commercial / Office',
    'Commercial / Business',
    'Commercial / Building',
    'Commercial / Edificio Comercial',
    'Commercial / Corporate Floor',
    'Commercial / Consultorio',
    'Commercial / Industrial',
    'Commercial / Garage',
    'Commercial / Hotel',
    'Commercial / Edificio Residencial',
  ],
  LAND: [
    'Residential / Land Lot',
    'Commercial / Land Lot',
    'Residential / Agricultural',
    'Residential / Farm Ranch',
  ],
};

/** Tipos em que a área que vale é a total (`LotArea`): terreno, galpão, fazenda e chácara. */
export const LOT_AREA_TYPES: ReadonlySet<GrupoOlxPropertyType> = new Set([
  'Residential / Land Lot',
  'Commercial / Land Lot',
  'Commercial / Industrial',
  'Residential / Agricultural',
  'Residential / Farm Ranch',
]);

/** Tabela "Bedroom" da documentação (Kitnet tem regra própria: 0 quartos). */
export const BEDROOMS_REQUIRED: ReadonlySet<GrupoOlxPropertyType> = new Set([
  'Residential / Apartment',
  'Residential / Home',
  'Residential / Condo',
  'Residential / Village House',
  'Residential / Farm Ranch',
  'Residential / Penthouse',
  'Residential / Flat',
  'Residential / Loft',
  'Residential / Sobrado',
  'Residential / Agricultural',
  'Residential / Studio',
  'Commercial / Edificio Residencial',
]);

/** Tabela "Bathroom" da documentação. */
export const BATHROOMS_REQUIRED: ReadonlySet<GrupoOlxPropertyType> = new Set([
  'Residential / Apartment',
  'Residential / Home',
  'Residential / Condo',
  'Residential / Village House',
  'Residential / Farm Ranch',
  'Residential / Penthouse',
  'Residential / Flat',
  'Residential / Kitnet',
  'Residential / Loft',
  'Residential / Sobrado',
  'Residential / Agricultural',
  'Commercial / Consultorio',
  'Commercial / Edificio Residencial',
  'Commercial / Office',
]);

/** Nome do estado para o elemento `State` (a sigla vai no atributo `abbreviation`). */
export const STATE_NAMES: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

/** Texto comparável: sem acento, minúsculo, espaços simples. */
export function normalizeTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Leitura de tabela só pelas chaves próprias: `tabela["constructor"]` devolveria a função do
 * protótipo, e ela iria parar no XML (revisão de segurança de 01/10/2026).
 */
export function ownValue<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Sigla da UF a partir do que está no cadastro (sigla ou nome). */
export function resolveStateAbbreviation(value: string | null): string | null {
  if (value === null) return null;
  const upper = value.trim().toUpperCase();
  if (ownValue(STATE_NAMES, upper) !== undefined) return upper;
  const normalized = normalizeTerm(value);
  const found = Object.entries(STATE_NAMES).find(([, name]) => normalizeTerm(name) === normalized);
  return found ? found[0] : null;
}

/**
 * Características do cadastro (texto livre) → valores fechados do VRSync. Só o que tem
 * correspondência clara entra; o resto vira aviso, sem bloquear.
 */
const FEATURE_BY_TERM: Record<string, string> = {
  academia: 'Gym',
  'espaco fitness': 'Fitness Room',
  fitness: 'Fitness Room',
  piscina: 'Pool',
  'piscina aquecida': 'Heated Pool',
  'piscina coberta': 'Covered Pool',
  'piscina infantil': 'Childrens Pool',
  'piscina privativa': 'Private Pool',
  churrasqueira: 'BBQ',
  'churrasqueira na varanda': 'Barbecue Balcony',
  varanda: 'Balcony',
  sacada: 'Balcony',
  'varanda gourmet': 'Gourmet Balcony',
  'varanda fechada': 'Wall Balcony',
  'varanda fechada com vidro': 'Wall Balcony',
  'espaco gourmet': 'Gourmet Area',
  'area gourmet': 'Gourmet Area',
  'cozinha gourmet': 'Gourmet Kitchen',
  'cozinha americana': 'American Kitchen',
  cozinha: 'Kitchen',
  elevador: 'Elevator',
  playground: 'Playground',
  'salao de festas': 'Party Room',
  'salao de jogos': 'Game room',
  sauna: 'Sauna',
  'quadra poliesportiva': 'Sports Court',
  'quadra de tenis': 'Tennis court',
  'quadra de squash': 'Squash',
  'quadra de areia': 'Sand Pit',
  'quadra de futebol': 'Indoor Soccer',
  'campo de futebol': 'Football Field',
  'portaria 24h': 'Concierge 24h',
  'portaria 24 horas': 'Concierge 24h',
  interfone: 'Intercom',
  alarme: 'Alarm System',
  'sistema de alarme': 'Alarm System',
  'camera de seguranca': 'Security Camera',
  'cameras de seguranca': 'Security Camera',
  'circuito de seguranca': 'TV Security',
  cftv: 'TV Security',
  'condominio fechado': 'Fenced Yard',
  vigia: 'Controlled Access',
  ronda: 'Patrol',
  vigilancia: 'Patrol',
  'ar condicionado': 'Cooling',
  aquecimento: 'Heating',
  lareira: 'Fireplace',
  mobiliado: 'Furnished',
  'armario embutido': 'Builtin Wardrobe',
  'armarios embutidos': 'Builtin Wardrobe',
  'armario na cozinha': 'Kitchen Cabinets',
  'armarios na cozinha': 'Kitchen Cabinets',
  'armario no quarto': 'Bedroom Wardrobe',
  'armario no banheiro': 'Bathroom Cabinets',
  closet: 'Closet',
  banheira: 'Bathtub',
  hidromassagem: 'Whirlpool',
  ofuro: 'Hot Tub',
  lavanderia: 'Laundry',
  'area de servico': "Maid's Quarters",
  'dependencia de empregados': 'Employee Dependency',
  'dependencia de empregada': 'Employee Dependency',
  'quarto de servico': 'Service Room',
  'banheiro de servico': 'Service Bathroom',
  quintal: 'Backyard',
  jardim: 'Garden Area',
  gramado: 'Lawn',
  edicula: 'Edicule',
  escritorio: 'Home Office',
  'home office': 'Home Office',
  despensa: 'Pantry',
  copa: 'Copa',
  'sala de jantar': 'Dinner Room',
  lavabo: 'Lavabo',
  mezanino: 'Mezzanine',
  'vista para o mar': 'Ocean View',
  'vista mar': 'Ocean View',
  'vista para a montanha': 'Mountain View',
  'vista para o lago': 'Lake View',
  'vista panoramica': 'Panoramic View',
  'aceita pets': 'Pets Allowed',
  'aceita animais': 'Pets Allowed',
  'permite animais': 'Pets Allowed',
  'pet friendly': 'Pets Allowed',
  'espaco pet': 'Pet Space',
  bicicletario: 'Bicycles Place',
  brinquedoteca: 'Toys Place',
  cinema: 'Media Room',
  'sala de cinema': 'Media Room',
  coworking: 'Coworking',
  gerador: 'Generator',
  'energia solar': 'Solar Energy',
  'portao eletronico': 'Electronic Gate',
  'fechadura digital': 'Digital Locker',
  'piso de madeira': 'Wood Floor',
  'piso laminado': 'Laminated Floor',
  'piso vinilico': 'Vinyl Floor',
  porcelanato: 'Porcelain',
  'moveis planejados': 'Planned Furniture',
  'movel planejado': 'Planned Furniture',
  acessibilidade: 'Disabled Access',
  'acesso para deficientes': 'Disabled Access',
  deposito: 'Warehouse',
  'reservatorio de agua': 'Water Tank',
  'poco artesiano': 'Artesian Well',
  horta: 'Vegetable Garden',
  pomar: 'Pomar',
  spa: 'Spa',
  'pista de cooper': 'Jogging track',
  'pista de caminhada': 'Jogging track',
  'area verde': 'Green space / Park',
  'espaco verde': 'Green space / Park',
  'area de lazer': 'Recreation Area',
  recepcao: 'Reception room',
  'sala de reuniao': 'Meeting Room',
  manobrista: 'Valet Parking',
  'estacionamento para visitantes': 'Guest Parking',
  zelador: 'Caretaker',
  internet: 'Internet Connection',
  wifi: 'Internet Connection',
  'wi fi': 'Internet Connection',
  'tv a cabo': 'Cable Television',
  'condominio sustentavel': 'Eco Condominium',
  'coleta seletiva': 'Eco Garbage Collector',
  'carregador de carro eletrico': 'Electric Charger',
  'carregador eletrico': 'Electric Charger',
  'ambientes integrados': 'Integrated Environments',
  'pe direito alto': 'High Ceiling Height',
  'imovel de esquina': 'Corner Property',
  deck: 'Deck',
  solarium: 'Solarium',
  heliponto: 'Helipad',
  'espaco de beleza': 'Beauty Room',
};

export function mapFeature(term: string): string | null {
  return ownValue(FEATURE_BY_TERM, normalizeTerm(term)) ?? null;
}
