import { CHANNEL_TYPE_LABELS, VISIT_STATUS_LABELS, label } from './labels';

/**
 * Visão Geral (tela 32, `telas/gestao/01-painel.dc.html#visao`; ADR-105, B14): as frases e as
 * barras que a página monta a partir de GET /dashboard/summary e da demanda por bairro. A API
 * devolve dado; o texto ("sem retorno há 30 min", "Vence hoje", "Hoje 10:30") nasce aqui, no
 * fuso de São Paulo e no instante `generatedAt` da resposta.
 */

const FUSO = 'America/Sao_Paulo';
const DIA_MS = 86_400_000;

export type ItemDaFila =
  | {
      kind: 'LEAD';
      tone: 'danger';
      id: string;
      name: string | null;
      source: string | null;
      channel: string | null;
      at: string;
    }
  | {
      kind: 'VISIT';
      tone: 'neutral';
      id: string;
      name: string | null;
      property: string | null;
      status: string;
      at: string;
    }
  | {
      kind: 'PROPOSAL';
      tone: 'warning';
      id: string;
      name: string | null;
      property: string | null;
      validUntil: string;
    }
  | {
      kind: 'INSPECTION';
      tone: 'neutral';
      id: string;
      inspectionType: string;
      property: string | null;
      status: string;
      at: string | null;
    }
  | {
      kind: 'CHANNEL';
      tone: 'warning';
      id: string;
      channel: string;
      propertyCode: string | null;
      error: string | null;
      at: string;
    };

export interface FilaDaVisao {
  items: ItemDaFila[];
  total: number;
  attention: number;
}

/** Ciclo de locação da semana; etapa nula = sem permissão (a tela mostra "—"). */
export interface CicloDaSemana {
  start: string;
  leads: number | null;
  qualified: number | null;
  visits: number | null;
  proposals: number | null;
  screening: number | null;
  contracts: number | null;
  leases: number | null;
}

export interface LinhaDaFila {
  chave: string;
  tipo: 'LEAD' | 'VISITA' | 'PROPOSTA' | 'VISTORIA' | 'CANAL';
  titulo: string;
  meta: string;
  prazo: string;
  href: string;
  tom: 'danger' | 'warning' | 'neutral';
}

const DIA_CIVIL = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const HORA_CHEIA = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  hour: 'numeric',
  hourCycle: 'h23',
});

/** Data civil de São Paulo (AAAA-MM-DD). */
function diaCivil(instante: Date): string {
  return DIA_CIVIL.format(instante);
}

/** "27/09" a partir de AAAA-MM-DD. */
function diaEMes(data: string): string {
  const [, mes = '', dia = ''] = data.split('-');
  return `${dia}/${mes}`;
}

/** "Hoje 10:30", "Ontem" ou "27/09", pelo dia civil de São Paulo. */
export function quando(iso: string, agora: Date): string {
  const instante = new Date(iso);
  const dia = diaCivil(instante);
  if (dia === diaCivil(agora)) return `Hoje ${HORA.format(instante)}`;
  if (dia === diaCivil(new Date(agora.getTime() - DIA_MS))) return 'Ontem';
  return diaEMes(dia);
}

/** "há 30 min", "há 2 h", "há 3 dias". */
export function haQuanto(iso: string, agora: Date): string {
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutos < 60) return `há ${String(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${String(horas)} h`;
  const dias = Math.floor(horas / 24);
  return `há ${String(dias)} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** De onde o lead veio, como a equipe fala; valor desconhecido aparece como veio. */
const ORIGEM_DO_LEAD: Record<string, string> = {
  PORTAL_ACHOUIMOVEL: 'Portal AchouImóvel',
  PORTAL: 'Portal',
  WHATSAPP: 'WhatsApp',
  INDICACAO: 'Indicação',
  META: 'Meta',
  MANUAL: 'Cadastro manual',
};

/** Vistoria pelo momento da locação, curto como na fila: "Entrada · Apto 804 Setor Marista". */
export const VISTORIA_NA_FILA: Record<string, string> = {
  CHECKIN: 'Entrada',
  CHECKOUT: 'Saída',
  INTERMEDIATE: 'Intermediária',
};

function origemDoLead(source: string | null, channel: string | null): string {
  const valor = source ?? channel;
  return valor === null ? 'Sem origem' : (ORIGEM_DO_LEAD[valor] ?? valor);
}

function comImovel(quem: string, imovel: string | null): string {
  return imovel === null ? quem : `${quem} · ${imovel}`;
}

/** Uma linha da fila "Próximas ações" (01-painel.dc.html:54, dados em :230-236). */
export function linhaDaFila(item: ItemDaFila, agora: Date): LinhaDaFila {
  switch (item.kind) {
    case 'LEAD':
      return {
        chave: `LEAD-${item.id}`,
        tipo: 'LEAD',
        titulo: `${item.name ?? 'Lead sem nome'} · sem retorno ${haQuanto(item.at, agora)}`,
        meta: origemDoLead(item.source, item.channel),
        prazo: quando(item.at, agora),
        href: `/app/crm/leads/${item.id}`,
        tom: item.tone,
      };
    case 'VISIT':
      return {
        chave: `VISIT-${item.id}`,
        tipo: 'VISITA',
        titulo: comImovel(item.name ?? 'Visita', item.property),
        meta: label(VISIT_STATUS_LABELS, item.status),
        prazo: quando(item.at, agora),
        href: '/app/visits',
        tom: item.tone,
      };
    case 'PROPOSAL':
      return {
        chave: `PROPOSAL-${item.id}`,
        tipo: 'PROPOSTA',
        titulo: comImovel(item.name ?? 'Proposta', item.property),
        meta: 'Vence hoje',
        prazo: item.validUntil === diaCivil(agora) ? 'Hoje' : diaEMes(item.validUntil),
        href: '/app/proposals',
        tom: item.tone,
      };
    case 'INSPECTION':
      return {
        chave: `INSPECTION-${item.id}`,
        tipo: 'VISTORIA',
        titulo: comImovel(VISTORIA_NA_FILA[item.inspectionType] ?? 'Vistoria', item.property),
        meta: 'Em aberto',
        prazo: item.at === null ? 'Hoje' : quando(item.at, agora),
        href: `/app/inspections/${item.id}`,
        tom: item.tone,
      };
    case 'CHANNEL': {
      const recusa = `${label(CHANNEL_TYPE_LABELS, item.channel)} recusou ${item.propertyCode ?? 'o anúncio'}`;
      return {
        chave: `CHANNEL-${item.id}`,
        tipo: 'CANAL',
        titulo: item.error === null ? recusa : `${recusa} · ${item.error}`,
        meta: 'Falha de publicação',
        prazo: quando(item.at, agora),
        href: '/app/channels',
        tom: item.tone,
      };
    }
  }
}

/** Tipo curto da demanda, como no cartão: "Apto 2 qts", "Kitnet", "Casa". */
export const TIPO_NA_DEMANDA: Record<string, string> = {
  APARTMENT: 'Apto',
  HOUSE: 'Casa',
  HOUSE_CONDO: 'Casa em condomínio',
  TOWNHOUSE: 'Sobrado',
  STUDIO: 'Kitnet',
  PENTHOUSE: 'Cobertura',
  COMMERCIAL: 'Sala e loja',
  LAND: 'Terreno',
};

export function tipoDaDemanda(linha: {
  propertyType: string | null;
  bedrooms: number | null;
  purpose: 'RENT' | 'SALE';
}): string {
  const partes: string[] = [];
  if (linha.propertyType !== null) {
    partes.push(TIPO_NA_DEMANDA[linha.propertyType] ?? linha.propertyType);
  }
  if (linha.bedrooms !== null) {
    // Na busca do portal, 4 quartos quer dizer 4 ou mais.
    partes.push(
      linha.bedrooms >= 4
        ? `${String(linha.bedrooms)}+ qts`
        : `${String(linha.bedrooms)} ${linha.bedrooms === 1 ? 'qto' : 'qts'}`,
    );
  }
  const texto = partes.length === 0 ? 'Qualquer imóvel' : partes.join(' ');
  return linha.purpose === 'SALE' ? `${texto} à venda` : texto;
}

/** Largura de cada barra, em %, em relação à maior, como o `renderVals()` (31 → 100, 14 → 45). */
export function larguras(valores: ReadonlyArray<number | null>): number[] {
  const maior = Math.max(1, ...valores.map((valor) => valor ?? 0));
  return valores.map((valor) => Math.round(((valor ?? 0) / maior) * 100));
}

/** "Bom dia" das 5h ao meio-dia, "Boa tarde" até as 18h, "Boa noite" no resto, em São Paulo. */
export function saudacao(agora: Date): string {
  const hora = Number(HORA_CHEIA.format(agora)) % 24;
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Subtítulo da saudação: "3 pendências exigem atenção hoje." */
export function fraseDasPendencias(pendencias: number): string {
  if (pendencias === 0) return 'Nenhuma pendência exige atenção hoje.';
  if (pendencias === 1) return '1 pendência exige atenção hoje.';
  return `${String(pendencias)} pendências exigem atenção hoje.`;
}
