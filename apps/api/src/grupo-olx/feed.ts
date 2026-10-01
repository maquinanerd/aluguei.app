import { createHash } from 'node:crypto';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { channelConnections, channelFeedFetches, listingChannelPublications } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { FEED_DESIRED_STATUSES, isChannelPublicationStatus, nextFeedStatus } from '@aluguei/domain';
import type { ChannelPublicationStatus } from '@aluguei/domain';
import type { GrupoOlxDisplayAddress, GrupoOlxListingIssue } from '@aluguei/contracts';
import {
  VRSYNC_MAX_LISTINGS,
  evaluateVrsyncListing,
  renderVrsyncDocumentEnd,
  renderVrsyncDocumentStart,
  renderVrsyncListing,
} from '@aluguei/integrations';
import type { VrsyncAgency } from '@aluguei/integrations';
import type { ConnectionRow } from './connection.js';
import { FEED_PAGE_SIZE, GRUPO_OLX_CHANNEL, loadFeedRows, toVrsyncInput } from './feed-data.js';

/**
 * User-Agent do robô do Grupo OLX ("VivaRealBot/1.0 (+http://www.vivareal.com/bot.html)").
 * Identifica, não autentica: quem autentica é o token. Só a busca do robô move o estado dos
 * anúncios — a imobiliária abrindo a URL no navegador não diz nada sobre o portal.
 */
export function isGrupoOlxCrawler(userAgent: string | undefined): boolean {
  return /^VivaRealBot\//i.test(userAgent?.trim() ?? '');
}

interface FeedEntry {
  publicationId: string;
  current: ChannelPublicationStatus;
  included: boolean;
  previousHash: string | null;
  hash: string | null;
  issues: GrupoOlxListingIssue[];
}

export interface FeedRunSummary {
  listingCount: number;
  blockedCount: number;
  bytes: number;
  overLimit: boolean;
}

export interface GenerateFeedOptions {
  db: AppDb;
  connection: ConnectionRow;
  agency: VrsyncAgency;
  apiPublicUrl: string;
  now: Date;
  /** Chamado depois do último trecho e antes de o arquivo terminar (o robô espera a contabilidade). */
  onComplete?: (summary: FeedRunSummary, entries: FeedEntry[]) => Promise<void>;
  /** Chamado se a geração parar no meio (erro ou conexão encerrada). */
  onAbort?: (summary: FeedRunSummary, reason: string) => Promise<void>;
  /** Falha da contabilidade não derruba o arquivo que já foi entregue: vai para o log. */
  onBookkeepingError?: (err: unknown) => void;
}

const OVER_LIMIT_ISSUE: GrupoOlxListingIssue = {
  code: 'FEED_OVER_LIMIT',
  message: `Fora do arquivo: o Grupo OLX processa até ${String(VRSYNC_MAX_LISTINGS)} anúncios por arquivo.`,
  blocking: true,
};

function statusOf(value: string): ChannelPublicationStatus {
  if (!isChannelPublicationStatus(value)) {
    throw new Error(`estado de publicação inválido: ${value}`);
  }
  return value;
}

/**
 * Arquivo VRSync da imobiliária, em trechos: cabeçalho, uma página de anúncios por vez, rodapé.
 * Cada anúncio é reavaliado na hora; inválido fica fora. Nada de montar 50 mil anúncios na memória.
 */
export async function* generateGrupoOlxFeed(options: GenerateFeedOptions): AsyncGenerator<string> {
  const { db, connection, agency, apiPublicUrl, now } = options;
  const context = {
    agency,
    displayAddress: connection.displayAddress as GrupoOlxDisplayAddress,
  };
  const summary: FeedRunSummary = { listingCount: 0, blockedCount: 0, bytes: 0, overLimit: false };
  const entries: FeedEntry[] = [];
  // Uma conclusão só: entregue (onComplete) ou interrompida (onAbort), nunca as duas.
  let settled = false;
  const settle = async (run: () => Promise<void> | undefined): Promise<void> => {
    if (settled) return;
    settled = true;
    try {
      await run();
    } catch (err) {
      options.onBookkeepingError?.(err);
    }
  };
  try {
    const head = renderVrsyncDocumentStart(agency, now);
    summary.bytes += Buffer.byteLength(head);
    yield head;
    let cursor: string | undefined;
    for (;;) {
      const rows = await loadFeedRows(db, connection.orgId, {
        statuses: FEED_DESIRED_STATUSES,
        ...(cursor ? { afterListingId: cursor } : {}),
      });
      if (rows.length === 0) break;
      let chunk = '';
      for (const row of rows) {
        const input = toVrsyncInput(row, apiPublicUrl);
        const evaluation = evaluateVrsyncListing(input, context);
        const base = {
          publicationId: row.publication.id,
          current: statusOf(row.publication.status),
          previousHash: row.publication.feedContentHash,
        };
        if (!evaluation.eligible) {
          summary.blockedCount += 1;
          entries.push({ ...base, included: false, hash: null, issues: evaluation.issues });
          continue;
        }
        if (summary.listingCount >= VRSYNC_MAX_LISTINGS) {
          summary.overLimit = true;
          summary.blockedCount += 1;
          entries.push({
            ...base,
            included: false,
            hash: null,
            issues: [OVER_LIMIT_ISSUE, ...evaluation.issues],
          });
          continue;
        }
        const fragment = renderVrsyncListing(input, context);
        chunk += fragment;
        summary.listingCount += 1;
        entries.push({
          ...base,
          included: true,
          hash: createHash('sha256').update(fragment).digest('hex'),
          issues: evaluation.issues,
        });
      }
      if (chunk !== '') {
        summary.bytes += Buffer.byteLength(chunk);
        yield chunk;
      }
      if (rows.length < FEED_PAGE_SIZE) break;
      cursor = rows[rows.length - 1]?.listing.id;
    }
    const tail = renderVrsyncDocumentEnd();
    summary.bytes += Buffer.byteLength(tail);
    yield tail;
    await settle(() => options.onComplete?.(summary, entries));
  } catch (err) {
    await settle(() =>
      options.onAbort?.(summary, err instanceof Error ? err.message : String(err)),
    );
    throw err;
  } finally {
    // `return()` do consumidor (conexão encerrada) cai aqui sem passar pelo catch.
    await settle(() => options.onAbort?.(summary, 'conexão encerrada antes do fim do arquivo'));
  }
}

const UPDATE_BATCH = 500;

/**
 * Depois de uma busca **do robô**: quem foi no arquivo passa a "aguardando relatório" (ou fica como
 * o relatório disse, se a versão não mudou); quem ficou fora por dado inválido vira BLOCKED; quem
 * estava saindo vira REMOVED. Grava só onde o estado não mudou desde a leitura (concorrência).
 */
export async function applyCrawlerFetch(
  db: AppDb,
  orgId: string,
  entries: FeedEntry[],
  fetchStartedAt: Date,
): Promise<void> {
  const now = new Date();
  for (let i = 0; i < entries.length; i += UPDATE_BATCH) {
    const batch = entries.slice(i, i + UPDATE_BATCH).map((entry) => {
      const next = nextFeedStatus(entry.current, {
        kind: 'CRAWLER_FETCH',
        included: entry.included,
        contentChanged: entry.included && entry.hash !== entry.previousHash,
      });
      return sql`(${entry.publicationId}::uuid, ${entry.current}::text, ${next}::text, ${entry.hash}::text, ${JSON.stringify(entry.issues)}::jsonb, ${entry.included}::boolean)`;
    });
    if (batch.length === 0) continue;
    await db.execute(sql`
      update listing_channel_publications as p
      set status = v.next_status,
          feed_content_hash = case when v.included then v.hash else p.feed_content_hash end,
          last_in_feed_at = case when v.included then ${now}::timestamptz else p.last_in_feed_at end,
          issues = v.issues,
          updated_at = ${now}::timestamptz
      from (values ${sql.join(batch, sql`, `)}) as v(id, current_status, next_status, hash, issues, included)
      where p.id = v.id and p.org_id = ${orgId}::uuid and p.status = v.current_status
    `);
  }
  // Tirado no meio da busca, mas já levado nela: continua no portal até a próxima busca, então é
  // REMOVING, não REMOVED (revisão de segurança de 01/10/2026).
  const included = entries.filter((entry) => entry.included).map((entry) => entry.publicationId);
  for (let i = 0; i < included.length; i += UPDATE_BATCH) {
    await db
      .update(listingChannelPublications)
      .set({ status: 'REMOVING', lastInFeedAt: now, updatedAt: now })
      .where(
        and(
          inArray(listingChannelPublications.id, included.slice(i, i + UPDATE_BATCH)),
          eq(listingChannelPublications.status, 'REMOVED'),
          gte(listingChannelPublications.updatedAt, fetchStartedAt),
        ),
      );
  }
  // Quem estava saindo e não foi neste arquivo já saiu. Só o que mudou antes da busca começar:
  // um "tirar" no meio da busca pode ter ido no arquivo que o robô acabou de levar.
  await db
    .update(listingChannelPublications)
    .set({ status: 'REMOVED', updatedAt: now })
    .where(
      and(
        eq(listingChannelPublications.orgId, orgId),
        eq(listingChannelPublications.channel, GRUPO_OLX_CHANNEL),
        eq(listingChannelPublications.status, 'REMOVING'),
        lt(listingChannelPublications.updatedAt, fetchStartedAt),
      ),
    );
}

export interface RecordFetchInput {
  connection: ConnectionRow;
  isCrawler: boolean;
  userAgent: string | undefined;
  summary: FeedRunSummary;
  startedAt: Date;
  outcome: 'OK' | 'ERROR';
  errorMessage?: string;
}

/** Registra a busca e atualiza a observabilidade da conexão. */
export async function recordFeedFetch(db: AppDb, input: RecordFetchInput): Promise<void> {
  const now = new Date();
  const { connection, summary } = input;
  await db.insert(channelFeedFetches).values({
    orgId: connection.orgId,
    connectionId: connection.id,
    channel: GRUPO_OLX_CHANNEL,
    fetchedAt: input.startedAt,
    isCrawler: input.isCrawler,
    userAgent: input.userAgent?.slice(0, 200) ?? null,
    listingCount: summary.listingCount,
    blockedCount: summary.blockedCount,
    bytes: summary.bytes,
    durationMs: Math.max(0, now.getTime() - input.startedAt.getTime()),
    outcome: input.outcome,
    errorMessage: input.errorMessage?.slice(0, 500) ?? null,
  });
  const failed = input.outcome === 'ERROR';
  const overLimit = !failed && summary.overLimit;
  await db
    .update(channelConnections)
    .set({
      lastFeedFetchAt: input.startedAt,
      ...(input.isCrawler && !failed
        ? {
            lastCrawlerFetchAt: input.startedAt,
            lastCrawlerListingCount: summary.listingCount,
            lastSuccessAt: now,
          }
        : {}),
      ...(failed || overLimit
        ? {
            lastErrorAt: now,
            lastErrorCode: failed ? 'FEED_GENERATION_FAILED' : 'FEED_OVER_LIMIT',
            lastErrorMessage: failed
              ? (input.errorMessage ?? 'falha ao gerar o arquivo').slice(0, 500)
              : OVER_LIMIT_ISSUE.message,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(channelConnections.id, connection.id));
}
