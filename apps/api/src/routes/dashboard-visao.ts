import { and, asc, desc, eq, gte, inArray, lt, ne, notInArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  contracts,
  inspections,
  leads,
  leases,
  listingChannelPublications,
  listings,
  parties,
  properties,
  proposals,
  rentalApplications,
  visits,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import type { Permission } from '@aluguei/domain';

/**
 * Peças da Visão Geral da rodada de fidelidade (ADR-105, B14; tela 32,
 * `telas/gestao/01-painel.dc.html#visao`): a fila "Próximas ações", o ciclo de locação da semana
 * e os imóveis reservados. A API devolve dado estruturado; as frases ("sem retorno há 30 min",
 * "Vence hoje") são do painel.
 */

const count = z.number().int().nonnegative();

/** Motivo da recusa do Grupo OLX: a primeira crítica bloqueante do relatório (ADR-108). */
function primeiraCritica(issues: unknown): string | null {
  if (!Array.isArray(issues)) return null;
  const critica = (issues as Array<{ message?: unknown; blocking?: unknown }>).find(
    (issue) => issue.blocking === true && typeof issue.message === 'string',
  );
  return typeof critica?.message === 'string' ? critica.message : null;
}

export const queueItemSchema = z.discriminatedUnion('kind', [
  /** Lead sem retorno (status NEW): vermelho. */
  z.object({
    kind: z.literal('LEAD'),
    tone: z.literal('danger'),
    id: z.string(),
    name: z.string().nullable(),
    source: z.string().nullable(),
    channel: z.string().nullable(),
    at: z.string(),
  }),
  /** Visita marcada para hoje: neutra. */
  z.object({
    kind: z.literal('VISIT'),
    tone: z.literal('neutral'),
    id: z.string(),
    name: z.string().nullable(),
    property: z.string().nullable(),
    status: z.string(),
    at: z.string(),
  }),
  /** Proposta enviada que vence hoje: âmbar. */
  z.object({
    kind: z.literal('PROPOSAL'),
    tone: z.literal('warning'),
    id: z.string(),
    name: z.string().nullable(),
    property: z.string().nullable(),
    validUntil: z.string(),
  }),
  /** Vistoria em aberto marcada para hoje: neutra. */
  z.object({
    kind: z.literal('INSPECTION'),
    tone: z.literal('neutral'),
    id: z.string(),
    inspectionType: z.string(),
    property: z.string().nullable(),
    status: z.string(),
    at: z.string().nullable(),
  }),
  /** Publicação que o canal recusou: âmbar. */
  z.object({
    kind: z.literal('CHANNEL'),
    tone: z.literal('warning'),
    id: z.string(),
    channel: z.string(),
    propertyCode: z.string().nullable(),
    error: z.string().nullable(),
    at: z.string(),
  }),
]);

export type QueueItem = z.infer<typeof queueItemSchema>;

export const queueSchema = z.object({
  /** Até cinco itens, um de cada tipo antes de repetir tipo, na ordem da tela. */
  items: z.array(queueItemSchema),
  /** Quantos itens a fila tem ao todo: "5 item(ns) exigem atenção". */
  total: count,
  /** Quantos deles são pendência (vermelho ou âmbar): "3 pendências exigem atenção hoje." */
  attention: count,
});

export type Queue = z.infer<typeof queueSchema>;

/** Ciclo de locação da semana (segunda a domingo, São Paulo); nulo sem a permissão da etapa. */
export const weekSchema = z.object({
  start: z.string(),
  leads: count.nullable(),
  qualified: count.nullable(),
  visits: count.nullable(),
  proposals: count.nullable(),
  screening: count.nullable(),
  contracts: count.nullable(),
  leases: count.nullable(),
});

export type Week = z.infer<typeof weekSchema>;

const QUEUE_SIZE = 5;
const PER_KIND = 2;
const UPCOMING_VISIT_STATUSES = ['SCHEDULED', 'CONFIRMED'];
const INACTIVE_VISIT_STATUSES = ['CANCELLED', 'NO_SHOW'];
const OPEN_INSPECTION_STATUSES = ['DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW'];
const ACTIVE_LEASE_STATUSES = ['ACTIVE', 'DELINQUENT'];
/** Da qualificação em diante no funil, sem o perdido. */
const QUALIFIED_OR_LATER = ['QUALIFIED', 'VISIT', 'PROPOSAL', 'APPLICATION', 'WON'];
const DAY_MS = 86_400_000;

function all(...conditions: SQL[]): SQL {
  return and(...conditions) ?? sql`true`;
}

function countWhere(condition: SQL): SQL<number> {
  return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
}

const countAll = (): SQL<number> => sql<number>`count(*)`.mapWith(Number);

/** Um de cada tipo antes do segundo de qualquer tipo, até o tamanho da fila. */
export function intercalar(grupos: readonly QueueItem[][], tamanho: number): QueueItem[] {
  const fila: QueueItem[] = [];
  for (let rodada = 0; fila.length < tamanho; rodada += 1) {
    let pegou = false;
    for (const grupo of grupos) {
      const item = grupo[rodada];
      if (item && fila.length < tamanho) {
        fila.push(item);
        pegou = true;
      }
    }
    if (!pegou) break;
  }
  return fila;
}

export interface Janela {
  start: Date;
  end: Date;
}

/** Data civil (AAAA-MM-DD) de São Paulo no instante dado, para comparar com coluna `date`. */
export function dataEmSaoPaulo(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** Início da semana (segunda-feira, 00:00 em São Paulo) do dia informado. */
export function inicioDaSemana(dia: Janela): Date {
  const semana = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(new Date(dia.start.getTime() + DAY_MS / 2));
  const indice = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(semana);
  // Sem horário de verão desde 2019: o dia civil de São Paulo tem 24 h.
  return new Date(dia.start.getTime() - Math.max(indice, 0) * DAY_MS);
}

/** Total e os primeiros itens de um tipo da fila; sem a permissão, nada. */
async function tipoDaFila<T>(
  permitido: boolean,
  contar: () => Promise<number>,
  listar: () => Promise<T[]>,
): Promise<{ total: number; itens: T[] }> {
  if (!permitido) return { total: 0, itens: [] };
  const [total, itens] = await Promise.all([contar(), listar()]);
  return { total, itens };
}

export async function filaDeAcoes(
  db: AppDb,
  orgId: string,
  dia: Janela,
  pode: (permissao: Permission) => boolean,
): Promise<Queue> {
  const hoje = dataEmSaoPaulo(new Date(dia.start.getTime() + DAY_MS / 2));

  const leadSemRetorno = all(eq(leads.orgId, orgId), eq(leads.status, 'NEW'));
  const visitaDeHoje = all(
    eq(visits.orgId, orgId),
    inArray(visits.status, UPCOMING_VISIT_STATUSES),
    gte(visits.scheduledAt, dia.start),
    lt(visits.scheduledAt, dia.end),
  );
  const propostaQueVence = all(
    eq(proposals.orgId, orgId),
    eq(proposals.status, 'SENT'),
    eq(proposals.validUntil, hoje),
  );
  const vistoriaDeHoje = all(
    eq(inspections.orgId, orgId),
    inArray(inspections.status, OPEN_INSPECTION_STATUSES),
    gte(inspections.scheduledAt, dia.start),
    lt(inspections.scheduledAt, dia.end),
  );
  // Recusa de verdade: falha ao publicar, ou o relatório do Grupo OLX recusou o anúncio (ADR-108).
  // O bloqueio da nossa validação (BLOCKED) não entra: a fila diz "recusou", e quem bloqueou fomos nós.
  const publicacaoRecusada = all(
    eq(listingChannelPublications.orgId, orgId),
    inArray(listingChannelPublications.status, ['FAILED', 'IMPORT_ERROR']),
  );

  const [lead, visita, proposta, vistoria, canal] = await Promise.all([
    tipoDaFila(
      pode('lead:read'),
      () =>
        db
          .select({ n: countAll() })
          .from(leads)
          .where(leadSemRetorno)
          .then(([linha]) => linha?.n ?? 0),
      () =>
        db
          .select({
            id: leads.id,
            name: parties.name,
            source: leads.source,
            channel: leads.channel,
            at: leads.createdAt,
          })
          .from(leads)
          .leftJoin(parties, eq(parties.id, leads.partyId))
          .where(leadSemRetorno)
          .orderBy(asc(leads.createdAt), asc(leads.id))
          .limit(PER_KIND),
    ),
    tipoDaFila(
      pode('visit:read'),
      () =>
        db
          .select({ n: countAll() })
          .from(visits)
          .where(visitaDeHoje)
          .then(([linha]) => linha?.n ?? 0),
      () =>
        db
          .select({
            id: visits.id,
            name: parties.name,
            property: properties.title,
            status: visits.status,
            at: visits.scheduledAt,
          })
          .from(visits)
          .leftJoin(parties, eq(parties.id, visits.partyId))
          .leftJoin(properties, eq(properties.id, visits.propertyId))
          .where(visitaDeHoje)
          .orderBy(asc(visits.scheduledAt), asc(visits.id))
          .limit(PER_KIND),
    ),
    tipoDaFila(
      pode('proposal:read'),
      () =>
        db
          .select({ n: countAll() })
          .from(proposals)
          .where(propostaQueVence)
          .then(([linha]) => linha?.n ?? 0),
      () =>
        db
          .select({
            id: proposals.id,
            name: parties.name,
            property: properties.title,
            validUntil: proposals.validUntil,
          })
          .from(proposals)
          .leftJoin(parties, eq(parties.id, proposals.partyId))
          .leftJoin(properties, eq(properties.id, proposals.propertyId))
          .where(propostaQueVence)
          .orderBy(asc(proposals.createdAt), asc(proposals.id))
          .limit(PER_KIND),
    ),
    tipoDaFila(
      pode('inspection:read'),
      () =>
        db
          .select({ n: countAll() })
          .from(inspections)
          .where(vistoriaDeHoje)
          .then(([linha]) => linha?.n ?? 0),
      () =>
        db
          .select({
            id: inspections.id,
            inspectionType: inspections.type,
            property: properties.title,
            status: inspections.status,
            at: inspections.scheduledAt,
          })
          .from(inspections)
          .leftJoin(properties, eq(properties.id, inspections.propertyId))
          .where(vistoriaDeHoje)
          .orderBy(asc(inspections.scheduledAt), asc(inspections.id))
          .limit(PER_KIND),
    ),
    tipoDaFila(
      pode('listing:read'),
      () =>
        db
          .select({ n: countAll() })
          .from(listingChannelPublications)
          .where(publicacaoRecusada)
          .then(([linha]) => linha?.n ?? 0),
      () =>
        db
          .select({
            id: listingChannelPublications.id,
            channel: listingChannelPublications.channel,
            propertyCode: properties.code,
            error: listingChannelPublications.lastError,
            issues: listingChannelPublications.issues,
            at: listingChannelPublications.updatedAt,
          })
          .from(listingChannelPublications)
          .innerJoin(listings, eq(listings.id, listingChannelPublications.listingId))
          .leftJoin(properties, eq(properties.id, listings.propertyId))
          .where(publicacaoRecusada)
          .orderBy(desc(listingChannelPublications.updatedAt), asc(listingChannelPublications.id))
          .limit(PER_KIND),
    ),
  ]);

  const grupos: QueueItem[][] = [
    lead.itens.map((linha) => ({
      kind: 'LEAD' as const,
      tone: 'danger' as const,
      id: linha.id,
      name: linha.name,
      source: linha.source,
      channel: linha.channel,
      at: linha.at.toISOString(),
    })),
    visita.itens.map((linha) => ({
      kind: 'VISIT' as const,
      tone: 'neutral' as const,
      id: linha.id,
      name: linha.name,
      property: linha.property,
      status: linha.status,
      at: linha.at.toISOString(),
    })),
    proposta.itens.map((linha) => ({
      kind: 'PROPOSAL' as const,
      tone: 'warning' as const,
      id: linha.id,
      name: linha.name,
      property: linha.property,
      validUntil: linha.validUntil ?? hoje,
    })),
    vistoria.itens.map((linha) => ({
      kind: 'INSPECTION' as const,
      tone: 'neutral' as const,
      id: linha.id,
      inspectionType: linha.inspectionType,
      property: linha.property,
      status: linha.status,
      at: linha.at?.toISOString() ?? null,
    })),
    canal.itens.map((linha) => ({
      kind: 'CHANNEL' as const,
      tone: 'warning' as const,
      id: linha.id,
      channel: linha.channel,
      propertyCode: linha.propertyCode,
      error: linha.error ?? primeiraCritica(linha.issues),
      at: linha.at.toISOString(),
    })),
  ];
  return {
    items: intercalar(grupos, QUEUE_SIZE),
    total: lead.total + visita.total + proposta.total + vistoria.total + canal.total,
    attention: lead.total + proposta.total + canal.total,
  };
}

export async function cicloDaSemana(
  db: AppDb,
  orgId: string,
  dia: Janela,
  pode: (permissao: Permission) => boolean,
): Promise<Week> {
  const inicio = inicioDaSemana(dia);
  const fim = new Date(inicio.getTime() + 7 * DAY_MS);
  const naSemana = (coluna: Parameters<typeof gte>[0]) => all(gte(coluna, inicio), lt(coluna, fim));

  const [funil, visitas, enviadas, candidaturas, contratos, locacoes] = await Promise.all([
    pode('lead:read')
      ? db
          .select({
            leads: countWhere(naSemana(leads.createdAt)),
            qualified: countWhere(
              all(naSemana(leads.createdAt), inArray(leads.status, QUALIFIED_OR_LATER)),
            ),
          })
          .from(leads)
          .where(eq(leads.orgId, orgId))
          .then(([linha]) => linha ?? { leads: 0, qualified: 0 })
      : null,
    pode('visit:read')
      ? db
          .select({
            n: countWhere(
              all(naSemana(visits.scheduledAt), notInArray(visits.status, INACTIVE_VISIT_STATUSES)),
            ),
          })
          .from(visits)
          .where(eq(visits.orgId, orgId))
          .then(([linha]) => linha?.n ?? 0)
      : null,
    pode('proposal:read')
      ? db
          .select({ n: countWhere(naSemana(proposals.sentAt)) })
          .from(proposals)
          .where(eq(proposals.orgId, orgId))
          .then(([linha]) => linha?.n ?? 0)
      : null,
    pode('screening:read')
      ? db
          .select({ n: countWhere(naSemana(rentalApplications.createdAt)) })
          .from(rentalApplications)
          .where(eq(rentalApplications.orgId, orgId))
          .then(([linha]) => linha?.n ?? 0)
      : null,
    pode('contract:read')
      ? db
          .select({
            n: countWhere(
              all(
                naSemana(contracts.createdAt),
                ne(contracts.status, 'VOID'),
                eq(contracts.kind, 'LEASE'),
              ),
            ),
          })
          .from(contracts)
          .where(eq(contracts.orgId, orgId))
          .then(([linha]) => linha?.n ?? 0)
      : null,
    pode('finance:read')
      ? db
          .select({ n: countWhere(naSemana(leases.createdAt)) })
          .from(leases)
          .where(eq(leases.orgId, orgId))
          .then(([linha]) => linha?.n ?? 0)
      : null,
  ]);

  return {
    start: inicio.toISOString(),
    leads: funil?.leads ?? null,
    qualified: funil?.qualified ?? null,
    visits: visitas,
    proposals: enviadas,
    screening: candidaturas,
    contracts: contratos,
    leases: locacoes,
  };
}

/**
 * Imóveis reservados: ativos, com proposta aceita e ainda sem locação em vigor. Antes a tela
 * mostrava as locações ativas com esse rótulo (Anexo A do plano, tela 32).
 */
export async function imoveisReservados(db: AppDb, orgId: string): Promise<number> {
  const [linha] = await db
    .select({ n: sql<number>`count(distinct ${proposals.propertyId})`.mapWith(Number) })
    .from(proposals)
    .innerJoin(properties, eq(properties.id, proposals.propertyId))
    .where(
      all(
        eq(proposals.orgId, orgId),
        eq(proposals.status, 'ACCEPTED'),
        eq(properties.status, 'ACTIVE'),
        sql`not exists (select 1 from ${leases} where ${leases.propertyId} = ${proposals.propertyId} and ${inArray(leases.status, ACTIVE_LEASE_STATUSES)})`,
      ),
    );
  return linha?.n ?? 0;
}
