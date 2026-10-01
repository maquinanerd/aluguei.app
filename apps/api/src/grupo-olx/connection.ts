import { and, eq, isNull } from 'drizzle-orm';
import { DomainError } from '@aluguei/domain';
import { channelConnections } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { grupoOlxConnectionSchema } from '@aluguei/contracts';
import type { GrupoOlxConnection } from '@aluguei/contracts';
import { generateOpaqueToken, hashOpaqueToken } from '../email-outbox.js';
import { GRUPO_OLX_CHANNEL } from './feed-data.js';

export type ConnectionRow = typeof channelConnections.$inferSelect;

/** Caracteres finais do token mostrados na tela para conferir com o Canal Pro. */
const TOKEN_HINT_LENGTH = 4;

export async function loadConnection(db: AppDb, orgId: string): Promise<ConnectionRow | null> {
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(
      and(eq(channelConnections.orgId, orgId), eq(channelConnections.channel, GRUPO_OLX_CHANNEL)),
    )
    .limit(1);
  return row ?? null;
}

/** Cria a conexão desligada se ainda não existir (pedido concorrente não duplica: índice único). */
export async function ensureConnection(db: AppDb, orgId: string): Promise<ConnectionRow> {
  await db
    .insert(channelConnections)
    .values({ orgId, channel: GRUPO_OLX_CHANNEL })
    .onConflictDoNothing({ target: [channelConnections.orgId, channelConnections.channel] });
  const row = await loadConnection(db, orgId);
  if (!row) {
    throw new Error('conexão do Grupo OLX não criada');
  }
  return row;
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toConnectionDto(row: ConnectionRow): GrupoOlxConnection {
  return grupoOlxConnectionSchema.parse({
    id: row.id,
    enabled: row.enabled,
    destinations: row.destinations,
    externalAccountId: row.externalAccountId,
    externalCustomerId: row.externalCustomerId,
    displayAddress: row.displayAddress,
    listingQuota: row.listingQuota,
    featuredQuota: row.featuredQuota,
    superFeaturedQuota: row.superFeaturedQuota,
    feedToken:
      row.feedTokenHint !== null && row.feedTokenCreatedAt !== null
        ? { hint: row.feedTokenHint, createdAt: row.feedTokenCreatedAt.toISOString() }
        : null,
    lastFeedFetchAt: iso(row.lastFeedFetchAt),
    lastCrawlerFetchAt: iso(row.lastCrawlerFetchAt),
    lastCrawlerListingCount: row.lastCrawlerListingCount,
    lastReportAt: iso(row.lastReportAt),
    lastSuccessAt: iso(row.lastSuccessAt),
    lastErrorAt: iso(row.lastErrorAt),
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/**
 * Endereço público da API para URL que sai do sistema (feed e fotos). Em produção só https: o
 * robô do Grupo OLX recusa certificado inválido, e URL http exporia o token no caminho.
 */
export function resolveApiPublicUrl(env: {
  NODE_ENV?: string;
  API_PUBLIC_URL?: string | undefined;
}): string | null {
  const value = env.API_PUBLIC_URL?.trim();
  if (!value) {
    return null;
  }
  if (env.NODE_ENV === 'production' && !value.startsWith('https://')) {
    return null;
  }
  return value.replace(/\/+$/, '');
}

export function buildFeedUrl(apiPublicUrl: string, token: string): string {
  return `${apiPublicUrl}/integrations/grupo-olx/feed/${token}.xml`;
}

/**
 * Gera um token novo (32 bytes aleatórios, base64url) e guarda só o hash. O anterior deixa de
 * valer na hora: a imobiliária precisa atualizar a URL no Canal Pro.
 */
export async function rotateFeedToken(
  db: AppDb,
  orgId: string,
): Promise<{ token: string; connection: ConnectionRow }> {
  const connection = await ensureConnection(db, orgId);
  const token = generateOpaqueToken();
  const [updated] = await db
    .update(channelConnections)
    .set({
      feedTokenHash: hashOpaqueToken(token),
      feedTokenHint: token.slice(-TOKEN_HINT_LENGTH),
      feedTokenCreatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(channelConnections.id, connection.id),
        connection.feedTokenHash === null
          ? isNull(channelConnections.feedTokenHash)
          : eq(channelConnections.feedTokenHash, connection.feedTokenHash),
      ),
    )
    .returning();
  if (!updated) {
    throw new DomainError(
      'CONFLICT',
      'A URL do feed acabou de ser trocada em outra tela. Recarregue a página antes de gerar outra.',
    );
  }
  return { token, connection: updated };
}

export async function revokeFeedToken(db: AppDb, orgId: string): Promise<ConnectionRow | null> {
  const [updated] = await db
    .update(channelConnections)
    .set({
      feedTokenHash: null,
      feedTokenHint: null,
      feedTokenCreatedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(channelConnections.orgId, orgId), eq(channelConnections.channel, GRUPO_OLX_CHANNEL)),
    )
    .returning();
  return updated ?? null;
}

/** Token com cara de token: 43 caracteres base64url. Outra coisa nem chega ao banco. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedFeedToken(token: string): boolean {
  return TOKEN_FORMAT.test(token);
}

export async function findConnectionByFeedToken(
  db: AppDb,
  token: string,
): Promise<ConnectionRow | null> {
  if (!isWellFormedFeedToken(token)) {
    return null;
  }
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.feedTokenHash, hashOpaqueToken(token)),
        eq(channelConnections.channel, GRUPO_OLX_CHANNEL),
      ),
    )
    .limit(1);
  return row ?? null;
}
