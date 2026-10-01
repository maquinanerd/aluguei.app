/**
 * Grupo OLX / Canal Pro na tela (ADR-107). Módulo puro: nomes, ações e textos de apoio, sem
 * React e sem rede — a tela de Canais e a página do Grupo OLX usam daqui.
 */

/** Os 24 tipos do VRSync com o nome que o ZAP e o Viva Real usam nos filtros. */
export const PORTAL_PROPERTY_TYPE_LABELS: Record<string, string> = {
  'Residential / Apartment': 'Apartamento',
  'Residential / Home': 'Casa',
  'Residential / Condo': 'Casa de condomínio',
  'Residential / Village House': 'Casa de vila',
  'Residential / Farm Ranch': 'Chácara',
  'Residential / Penthouse': 'Cobertura',
  'Residential / Flat': 'Flat',
  'Residential / Kitnet': 'Kitnet / conjugado',
  'Residential / Studio': 'Studio',
  'Residential / Loft': 'Loft',
  'Residential / Sobrado': 'Sobrado',
  'Residential / Agricultural': 'Fazenda / sítio / chácara',
  'Residential / Land Lot': 'Terreno / lote (residencial)',
  'Commercial / Consultorio': 'Consultório',
  'Commercial / Edificio Residencial': 'Edifício residencial',
  'Commercial / Industrial': 'Galpão / depósito / armazém',
  'Commercial / Building': 'Imóvel comercial',
  'Commercial / Garage': 'Garagem',
  'Commercial / Hotel': 'Hotel / motel / pousada',
  'Commercial / Business': 'Loja / salão / ponto comercial',
  'Commercial / Corporate Floor': 'Andar / laje corporativa',
  'Commercial / Land Lot': 'Terreno / lote (comercial)',
  'Commercial / Office': 'Sala / conjunto comercial',
  'Commercial / Edificio Comercial': 'Prédio inteiro',
};

/** `PublicationType` do VRSync: destaque contratado no Grupo OLX, não no AchouImóvel. */
export const PUBLICATION_TIER_LABELS: Record<string, string> = {
  STANDARD: 'Padrão',
  PREMIUM: 'Destaque',
  SUPER_PREMIUM: 'Super destaque',
  PREMIERE_1: 'Destaque exclusivo (Zap+)',
  PREMIERE_2: 'Destaque superior (Zap+)',
  TRIPLE: 'Destaque triplo',
};

export const DESTINATION_LABELS: Record<string, string> = {
  ZAP: 'ZAP Imóveis',
  VIVAREAL: 'Viva Real',
  OLX: 'OLX',
};

/** Caminho no Canal Pro para cadastrar a URL (central de ajuda do ZAP, 01/10/2026). */
export const CANAL_PRO_PASSOS: readonly string[] = [
  'Entre no Canal Pro com a conta da imobiliária.',
  'Abra Configurações da conta → Integração de anúncios.',
  'Em "Selecione o Software", escolha "Desenvolvedor Próprio" (o AchouImóvel Gestão ainda não está na lista).',
  'Cole a URL do feed e salve. O Grupo OLX lê o arquivo a cada 12 horas.',
];

export type AcaoDoCanal = 'publicar' | 'remover' | null;

/**
 * A ação que faz sentido na linha da publicação. No feed, "publicar" reabre a avaliação de quem
 * saiu, falhou ou ficou bloqueado; "remover" tira do arquivo quem ainda está nele.
 */
export function acaoDaPublicacao(canal: string, status: string): AcaoDoCanal {
  if (canal === 'grupoolx') {
    if (['PENDING', 'FAILED', 'BLOCKED', 'REMOVED'].includes(status)) return 'publicar';
    if (
      [
        'ELIGIBLE',
        'AWAITING_IMPORT',
        'IMPORTED',
        'IMPORTED_WITH_WARNINGS',
        'IMPORT_ERROR',
      ].includes(status)
    ) {
      return 'remover';
    }
    return null;
  }
  if (status === 'FAILED' || status === 'REMOVED' || status === 'PENDING') return 'publicar';
  if (status === 'PUBLISHED') return 'remover';
  return null;
}

export interface Motivo {
  code: string;
  message: string;
  blocking: boolean;
}

/** O motivo que a linha mostra: o primeiro bloqueio, ou o primeiro aviso. */
export function motivoPrincipal(issues: readonly Motivo[]): Motivo | null {
  return issues.find((issue) => issue.blocking) ?? issues[0] ?? null;
}

/** "há 3 h", "há 2 dias" — ou "nunca", para a observabilidade da conexão. */
export function quando(iso: string | null, agora: Date): string {
  if (iso === null) return 'nunca';
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${String(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${String(horas)} h`;
  const dias = Math.floor(horas / 24);
  return `há ${String(dias)} ${dias === 1 ? 'dia' : 'dias'}`;
}
