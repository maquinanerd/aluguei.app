import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Webhooks do Grupo OLX (ADR-108): lead (`/webhooks/integration_leads.html`) e relatório de
 * importação (`/webhooks/integration_report_feeds_via_webhooks.html`), conferidos em 01/10/2026.
 * Puro: sem banco, sem rede. A API autentica, valida e grava na caixa de entrada; o worker processa.
 */

/** Usuário do Basic Auth nos exemplos oficiais (`vivareal:<SECRET_KEY>`). */
export const GRUPO_OLX_WEBHOOK_USER = 'vivareal';

export type GrupoOlxAuthResult = 'OK' | 'MISSING' | 'INVALID';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Confere o `Authorization: Basic base64(usuario:chave)`. Só a chave autentica (a documentação
 * confere só ela; o usuário é constante). Comparação em tempo constante sobre os hashes, para o
 * tamanho da chave também não vazar.
 */
export function verifyGrupoOlxAuthorization(
  header: string | undefined,
  secret: string,
): GrupoOlxAuthResult {
  if (header === undefined || header.trim() === '') {
    return 'MISSING';
  }
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header.trim());
  if (!match?.[1]) {
    return 'INVALID';
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) {
    return 'INVALID';
  }
  const presented = decoded.slice(separator + 1);
  return timingSafeEqual(digest(presented), digest(secret)) ? 'OK' : 'INVALID';
}

/** Cabeçalho que o Grupo OLX mandaria; usado pelos testes e pelo validador local. */
export function grupoOlxAuthorizationHeader(secret: string): string {
  return `Basic ${Buffer.from(`${GRUPO_OLX_WEBHOOK_USER}:${secret}`).toString('base64')}`;
}

const text = z.string().max(5000);
const shortText = z.string().max(300);

/**
 * Lead do Grupo OLX. Tolerante a campo novo (a documentação avisa que o payload cresce sem aviso),
 * estrito no que o processamento usa.
 */
export const grupoOlxLeadPayloadSchema = z
  .object({
    leadOrigin: shortText,
    timestamp: shortText.optional(),
    originLeadId: z.string().trim().min(1).max(200),
    originListingId: shortText.optional().nullable(),
    clientListingId: shortText.optional().nullable(),
    name: shortText.optional().nullable(),
    email: shortText.optional().nullable(),
    ddd: z.string().max(10).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    phoneNumber: z.string().max(40).optional().nullable(),
    message: text.optional().nullable(),
    temperature: shortText.optional().nullable(),
    transactionType: shortText.optional().nullable(),
    extraData: z
      .object({
        leadCerto: z.boolean().optional().nullable(),
        izi: text.optional().nullable(),
        feedback: text.optional().nullable(),
        leadType: shortText.optional().nullable(),
        mcmv: z
          .object({ sellerDocument: z.string().max(40).optional().nullable() })
          .loose()
          .optional()
          .nullable(),
      })
      .loose()
      .optional()
      .nullable(),
  })
  .loose();

export type GrupoOlxLeadPayload = z.infer<typeof grupoOlxLeadPayloadSchema>;

/** Origem dos leads de simulação do Minha Casa Minha Vida: não têm anúncio. */
export const GRUPO_OLX_MCMV_ORIGIN = 'MCMV_OLX';

export interface NormalizedGrupoOlxLead {
  originLeadId: string;
  kind: 'LISTING' | 'MCMV';
  clientListingId: string | null;
  originListingId: string | null;
  name: string | null;
  email: string | null;
  /** DDD + número, só dígitos (o `phoneNumber` antigo vale quando os dois faltam). */
  phone: string | null;
  message: string | null;
  temperature: string | null;
  /** Funil do CRM: `RENT` → aluguel, `SELL` → venda. */
  purpose: 'RENT' | 'SALE' | null;
  leadType: string | null;
  leadCerto: boolean;
  /** CPF/CNPJ do anunciante nos leads MCMV (para achar a imobiliária). */
  sellerDocument: string | null;
  receivedAt: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function normalizeGrupoOlxLead(payload: GrupoOlxLeadPayload): NormalizedGrupoOlxLead {
  const phone = digits(payload.ddd) + digits(payload.phone);
  const legacy = digits(payload.phoneNumber);
  const transaction = clean(payload.transactionType)?.toUpperCase() ?? null;
  const seller = digits(payload.extraData?.mcmv?.sellerDocument);
  return {
    originLeadId: payload.originLeadId.trim(),
    kind: payload.leadOrigin.trim() === GRUPO_OLX_MCMV_ORIGIN ? 'MCMV' : 'LISTING',
    clientListingId: clean(payload.clientListingId),
    originListingId: clean(payload.originListingId),
    name: clean(payload.name),
    email: clean(payload.email)?.toLowerCase() ?? null,
    phone: phone.length >= 10 ? phone : legacy.length >= 10 ? legacy : null,
    message: clean(payload.message),
    temperature: clean(payload.temperature),
    purpose: transaction === 'RENT' ? 'RENT' : transaction === 'SELL' ? 'SALE' : null,
    leadType: clean(payload.extraData?.leadType),
    leadCerto: payload.extraData?.leadCerto === true,
    sellerDocument: seller.length === 11 || seller.length === 14 ? seller : null,
    receivedAt: clean(payload.timestamp),
  };
}

/** Número que a documentação às vezes manda como texto ("listingsQuantity": "2"). */
const count = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: 'custom', message: 'número inválido' });
    return z.NEVER;
  }
  return Math.trunc(parsed);
});

const critique = z
  .object({
    errorMessage: z.string().max(2000).optional(),
    message: z.string().max(2000).optional(),
    externalIds: z.array(z.string().max(200)).max(50_000).optional(),
    listingsQuantity: count.optional(),
  })
  .loose();

/** Relatório de importação (`FEEDS_INTEGRATION_REPORT`). */
export const grupoOlxReportPayloadSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    company: shortText.optional().nullable(),
    type: shortText.optional().nullable(),
    description: text.optional().nullable(),
    details: z
      .object({
        date: shortText.optional().nullable(),
        total: count.optional().nullable(),
        updated: count.optional().nullable(),
        created: count.optional().nullable(),
        deleted: count.optional().nullable(),
        unchanged: count.optional().nullable(),
        error: count.optional().nullable(),
        warning: count.optional().nullable(),
      })
      .loose()
      .optional()
      .nullable(),
    link: z.string().max(2000).optional().nullable(),
    errors: z.array(critique).max(10_000).optional().nullable(),
    warnings: z.array(critique).max(10_000).optional().nullable(),
  })
  .loose();

export type GrupoOlxReportPayload = z.infer<typeof grupoOlxReportPayloadSchema>;

export interface ReportCritique {
  message: string;
  externalIds: string[];
}

export interface NormalizedGrupoOlxReport {
  externalReportId: string;
  company: string | null;
  reportDate: Date | null;
  contracted: number | null;
  created: number | null;
  updated: number | null;
  deleted: number | null;
  unchanged: number | null;
  errorCount: number | null;
  warningCount: number | null;
  link: string | null;
  errors: ReportCritique[];
  warnings: ReportCritique[];
  /** Todos os ids citados (sem espaço; o exemplo oficial tem "AP0511 "). */
  externalIds: string[];
}

/**
 * Data do relatório. O exemplo oficial vem sem fuso ("2020-09-30T19:21:13"); sem fuso, é horário
 * de Brasília (UTC−3, sem horário de verão desde 2019). Com fuso, vale o que vier.
 */
export function parseGrupoOlxReportDate(value: string | null | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const parsed = new Date(hasZone ? raw : `${raw}-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function critiques(list: GrupoOlxReportPayload['errors']): ReportCritique[] {
  return (list ?? []).map((item) => ({
    message: (item.errorMessage ?? item.message ?? '').trim() || 'Crítica sem mensagem',
    externalIds: (item.externalIds ?? []).map((id) => id.trim()).filter((id) => id !== ''),
  }));
}

export function normalizeGrupoOlxReport(payload: GrupoOlxReportPayload): NormalizedGrupoOlxReport {
  const errors = critiques(payload.errors);
  const warnings = critiques(payload.warnings);
  const details = payload.details ?? {};
  return {
    externalReportId: payload.id.trim(),
    company: clean(payload.company),
    reportDate: parseGrupoOlxReportDate(details.date),
    contracted: details.total ?? null,
    created: details.created ?? null,
    updated: details.updated ?? null,
    deleted: details.deleted ?? null,
    unchanged: details.unchanged ?? null,
    errorCount: details.error ?? null,
    warningCount: details.warning ?? null,
    link: clean(payload.link),
    errors,
    warnings,
    externalIds: [...new Set([...errors, ...warnings].flatMap((critique) => critique.externalIds))],
  };
}
