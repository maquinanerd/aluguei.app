import { and, eq, sql } from 'drizzle-orm';
import { listingChannelPublications } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { FEED_DESIRED_STATUSES, isChannelPublicationStatus, nextFeedStatus } from '@aluguei/domain';
import type { ChannelPublicationStatus } from '@aluguei/domain';
import type {
  GrupoOlxDisplayAddress,
  GrupoOlxPropertyType,
  GrupoOlxPublicationTier,
} from '@aluguei/contracts';
import { evaluateVrsyncListing } from '@aluguei/integrations';
import { loadConnection } from './connection.js';
import {
  FEED_PAGE_SIZE,
  GRUPO_OLX_CHANNEL,
  loadAgency,
  loadFeedRows,
  toVrsyncInput,
} from './feed-data.js';

type PublicationRow = typeof listingChannelPublications.$inferSelect;

function currentStatus(row: PublicationRow): ChannelPublicationStatus {
  if (!isChannelPublicationStatus(row.status)) {
    throw new Error(`estado de publicação inválido: ${row.status}`);
  }
  return row.status;
}

/**
 * Reavalia anúncios do Grupo OLX contra as regras do VRSync e grava o resultado (BLOCKED ou
 * ELIGIBLE, com os motivos). Sem `listingIds`, reavalia todos os desejados da imobiliária, em
 * páginas. Devolve quantos foram avaliados. O feed reavalia de novo ao gerar o arquivo: isto é
 * para a tela mostrar a situação sem esperar o robô.
 */
export async function evaluateGrupoOlxListings(
  db: AppDb,
  orgId: string,
  listingIds?: readonly string[],
): Promise<number> {
  const connection = await loadConnection(db, orgId);
  const agency = await loadAgency(db, orgId);
  const context = {
    agency,
    displayAddress: (connection?.displayAddress ?? 'Neighborhood') as GrupoOlxDisplayAddress,
  };
  let evaluated = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await loadFeedRows(db, orgId, {
      ...(listingIds ? { listingIds } : { statuses: FEED_DESIRED_STATUSES }),
      ...(cursor ? { afterListingId: cursor } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const current = currentStatus(row.publication);
      // A URL das fotos não entra na avaliação: base vazia basta.
      const evaluation = evaluateVrsyncListing(toVrsyncInput(row, ''), context);
      const next = nextFeedStatus(current, { kind: 'EVALUATED', eligible: evaluation.eligible });
      await db
        .update(listingChannelPublications)
        .set({
          status: next,
          // Removido não ganha motivo novo: ele não vai ao arquivo de qualquer forma.
          ...(next === 'REMOVED' || next === 'REMOVING' ? {} : { issues: evaluation.issues }),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(listingChannelPublications.id, row.publication.id),
            // Concorrência: só grava se ninguém mudou o estado desde a leitura.
            eq(listingChannelPublications.status, current),
          ),
        );
      evaluated += 1;
    }
    if (listingIds || rows.length < FEED_PAGE_SIZE) break;
    cursor = rows[rows.length - 1]?.listing.id;
  }
  return evaluated;
}

export interface FeedPublishSettings {
  publicationTier?: GrupoOlxPublicationTier | undefined;
  portalPropertyType?: GrupoOlxPropertyType | null | undefined;
}

/**
 * Pedido de publicação no Grupo OLX: grava a intenção e os ajustes da distribuição (destaque, tipo
 * no portal) e avalia na hora — a imobiliária vê o motivo do bloqueio sem esperar fila.
 */
export async function requestGrupoOlxPublish(
  db: AppDb,
  orgId: string,
  listingId: string,
  settings: FeedPublishSettings,
): Promise<PublicationRow> {
  const settingsPatch = {
    ...(settings.publicationTier !== undefined
      ? { publicationTier: settings.publicationTier }
      : {}),
    ...(settings.portalPropertyType !== undefined
      ? { portalPropertyType: settings.portalPropertyType }
      : {}),
  };
  await db
    .insert(listingChannelPublications)
    .values({ orgId, listingId, channel: GRUPO_OLX_CHANNEL, status: 'PENDING', ...settingsPatch })
    .onConflictDoNothing({
      target: [listingChannelPublications.listingId, listingChannelPublications.channel],
    });
  await transitionGuarded(db, orgId, listingId, (current) => ({
    status: nextFeedStatus(currentStatus(current), { kind: 'PUBLISH_REQUESTED' }),
    ...settingsPatch,
  }));
  await evaluateGrupoOlxListings(db, orgId, [listingId]);
  const updated = await loadPublication(db, orgId, listingId);
  if (!updated) {
    throw new Error('publicação do Grupo OLX sumiu');
  }
  return updated;
}

/** Ajusta destaque e tipo no portal de uma publicação existente e reavalia. */
export async function updateGrupoOlxSettings(
  db: AppDb,
  orgId: string,
  listingId: string,
  settings: FeedPublishSettings,
): Promise<PublicationRow | null> {
  const existing = await loadPublication(db, orgId, listingId);
  if (!existing) {
    return null;
  }
  await db
    .update(listingChannelPublications)
    .set({
      ...(settings.publicationTier !== undefined
        ? { publicationTier: settings.publicationTier }
        : {}),
      ...(settings.portalPropertyType !== undefined
        ? { portalPropertyType: settings.portalPropertyType }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(listingChannelPublications.id, existing.id));
  await evaluateGrupoOlxListings(db, orgId, [listingId]);
  return loadPublication(db, orgId, listingId);
}

/**
 * Tirar do Grupo OLX: sai do arquivo na hora; vira REMOVED direto se o robô nunca levou o
 * anúncio, ou REMOVING até a próxima busca sem ele.
 */
export async function requestGrupoOlxRemove(
  db: AppDb,
  orgId: string,
  listingId: string,
): Promise<PublicationRow | null> {
  const changed = await transitionGuarded(db, orgId, listingId, (current) => ({
    status: nextFeedStatus(currentStatus(current), {
      kind: 'REMOVE_REQUESTED',
      everInFeed: current.lastInFeedAt !== null,
    }),
  }));
  return changed ? loadPublication(db, orgId, listingId) : null;
}

/**
 * Grava a mudança só se o estado ainda for o que foi lido; se outra escrita chegou antes (a busca
 * do robô, outro pedido), relê e recalcula. Devolve falso quando a publicação não existe.
 */
async function transitionGuarded(
  db: AppDb,
  orgId: string,
  listingId: string,
  change: (current: PublicationRow) => Partial<typeof listingChannelPublications.$inferInsert>,
): Promise<boolean> {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const current = await loadPublication(db, orgId, listingId);
    if (!current) {
      return false;
    }
    const updated = await db
      .update(listingChannelPublications)
      .set({ ...change(current), updatedAt: new Date() })
      .where(
        and(
          eq(listingChannelPublications.id, current.id),
          eq(listingChannelPublications.status, current.status),
        ),
      )
      .returning({ id: listingChannelPublications.id });
    if (updated.length > 0) {
      return true;
    }
  }
  throw new Error('publicação do Grupo OLX mudou três vezes seguidas durante o pedido');
}

export async function loadPublication(
  db: AppDb,
  orgId: string,
  listingId: string,
): Promise<PublicationRow | null> {
  const [row] = await db
    .select()
    .from(listingChannelPublications)
    .where(
      and(
        eq(listingChannelPublications.orgId, orgId),
        eq(listingChannelPublications.listingId, listingId),
        eq(listingChannelPublications.channel, GRUPO_OLX_CHANNEL),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Contagem por estado das publicações do Grupo OLX da imobiliária (tela de acompanhamento). */
export async function countGrupoOlxByStatus(
  db: AppDb,
  orgId: string,
): Promise<Map<string, { total: number; premium: number; superPremium: number }>> {
  const result = await db.execute(sql`
    select status,
           count(*)::int as total,
           count(*) filter (where publication_tier = 'PREMIUM')::int as premium,
           count(*) filter (where publication_tier = 'SUPER_PREMIUM')::int as super_premium
    from listing_channel_publications
    where org_id = ${orgId} and channel = ${GRUPO_OLX_CHANNEL}
    group by status
  `);
  return new Map(
    (result.rows as Array<Record<string, unknown>>).map((row) => [
      String(row.status),
      {
        total: Number(row.total),
        premium: Number(row.premium),
        superPremium: Number(row.super_premium),
      },
    ]),
  );
}
