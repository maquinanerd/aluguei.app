import { sql } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  channelSyncJobs,
  leads,
  listings,
  listingChannelPublications,
  parties,
  partyIdentities,
  timelineEvents,
} from '@aluguei/db';
import { DomainError, normalizeEmail, normalizePhone } from '@aluguei/domain';
import type { ChannelPublicationStatus } from '@aluguei/domain';
import type { ChannelLeadInput, IListingChannelAdapter } from '@aluguei/integrations';
import { buildChannelListingInput } from '@aluguei/api/channel-jobs';

export interface RunChannelJobsOptions {
  db: AppDb;
  /** Resolve adapter por channel (ex.: FakeChannel compartilhado com a API em testes). */
  adapterFor: (channel: string) => IListingChannelAdapter | null;
  limit?: number;
  log?: (msg: string) => void;
}

interface ClaimedJob {
  id: string;
  orgId: string;
  listingId: string | null;
  channel: string;
  jobType: string;
  payload: Record<string, unknown> | null;
}

/** Claim atômico de jobs (SKIP LOCKED) — sem Redis, CI-friendly. */
async function claimJobs(db: AppDb, limit: number): Promise<ClaimedJob[]> {
  // Reaper: jobs presos em RUNNING (crash entre claim e finish) voltam a PENDING.
  await db.execute(sql`
    UPDATE channel_sync_jobs
    SET status = 'PENDING'
    WHERE status = 'RUNNING' AND started_at < now() - interval '5 minutes'
  `);
  const result = await db.execute(sql`
    UPDATE channel_sync_jobs
    SET status = 'RUNNING', started_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM channel_sync_jobs
      WHERE run_at <= now() AND (status = 'PENDING' OR (status = 'FAILED' AND attempts < 5))
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, org_id, listing_id, channel, job_type, payload
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    orgId: String(row.org_id),
    listingId: row.listing_id === null ? null : (row.listing_id as string),
    channel: String(row.channel),
    jobType: String(row.job_type),
    payload: row.payload ? (row.payload as Record<string, unknown>) : null,
  }));
}

async function resolvePublication(db: AppDb, orgId: string, listingId: string, channel: string) {
  const [publication] = await db
    .select()
    .from(listingChannelPublications)
    .where(
      and(
        eq(listingChannelPublications.orgId, orgId),
        eq(listingChannelPublications.listingId, listingId),
        eq(listingChannelPublications.channel, channel),
      ),
    )
    .limit(1);
  return publication ?? null;
}

async function updatePublication(
  db: AppDb,
  orgId: string,
  listingId: string,
  channel: string,
  status: ChannelPublicationStatus,
  extra: {
    channelListingId?: string | null;
    lastError?: string | null;
    lastPayload?: unknown;
  } = {},
): Promise<void> {
  const publication = await resolvePublication(db, orgId, listingId, channel);
  const patch: Record<string, unknown> = { status, updatedAt: new Date() };
  if (extra.channelListingId !== undefined) {
    patch.channelListingId = extra.channelListingId;
  }
  if (extra.lastError !== undefined) {
    patch.lastError = sanitizeError(String(extra.lastError));
  }
  if (extra.lastPayload !== undefined) {
    patch.lastPayload = extra.lastPayload;
  }
  if (status === 'PUBLISHED' && !publication?.publishedAt) {
    patch.publishedAt = new Date();
  }
  if (publication) {
    await db
      .update(listingChannelPublications)
      .set(patch as never)
      .where(eq(listingChannelPublications.id, publication.id));
    return;
  }
  // Worker é a fonte de execução: cria a publication se ainda não existir (upsert).
  await db.insert(listingChannelPublications).values({
    orgId,
    listingId,
    channel,
    status,
    channelListingId:
      patch.channelListingId !== undefined ? (patch.channelListingId as string | null) : null,
    lastError: patch.lastError !== undefined ? (patch.lastError as string | null) : null,
    lastPayload:
      patch.lastPayload !== undefined
        ? (patch.lastPayload as Record<string, unknown> | null)
        : null,
    publishedAt: patch.publishedAt !== undefined ? (patch.publishedAt as Date | null) : null,
  });
}

async function markJobSuccess(db: AppDb, jobId: string): Promise<void> {
  // Só marca SUCCESS se ainda estiver RUNNING — não sobrescreve um job
  // re-enfileirado (PATCH concorrente durante a execução).
  await db
    .update(channelSyncJobs)
    .set({ status: 'SUCCESS', finishedAt: new Date() })
    .where(and(eq(channelSyncJobs.id, jobId), eq(channelSyncJobs.status, 'RUNNING')));
}

function sanitizeError(message: string): string {
  return message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 500);
}

async function markJobFailed(db: AppDb, jobId: string, error: string): Promise<void> {
  // Retry automático: FAILED volta elegível quando run_at vence (attempts < 5 no claim).
  const safe = sanitizeError(error);
  await db.execute(
    sql`UPDATE channel_sync_jobs
        SET status = 'FAILED', last_error = ${safe}, finished_at = now(),
            run_at = now() + LEAST(POWER(2, attempts), 600) * interval '1 second'
        WHERE id = ${jobId}`,
  );
}

/** Importa leads do canal: dedupe party por identidade normalizada + cria lead. */
async function importLead(
  db: AppDb,
  orgId: string,
  channel: string,
  lead: ChannelLeadInput,
): Promise<boolean> {
  const identities: Array<{ kind: 'EMAIL' | 'PHONE'; value: string }> = [];
  if (lead.email) {
    identities.push({ kind: 'EMAIL', value: normalizeEmail(lead.email) });
  }
  if (lead.phone) {
    identities.push({ kind: 'PHONE', value: normalizePhone(lead.phone) });
  }
  if (identities.length === 0) {
    return false;
  }

  // Dedupe por (org, kind, value) — padrão Fase 02.
  let partyId: string | null = null;
  for (const identity of identities) {
    const [existing] = await db
      .select({ partyId: partyIdentities.partyId })
      .from(partyIdentities)
      .where(
        and(
          eq(partyIdentities.orgId, orgId),
          eq(partyIdentities.kind, identity.kind),
          eq(partyIdentities.value, identity.value),
        ),
      )
      .limit(1);
    if (existing) {
      partyId = existing.partyId;
      break;
    }
  }

  if (!partyId) {
    const [party] = await db
      .insert(parties)
      .values({ orgId, type: 'PERSON', name: lead.name })
      .returning();
    if (!party) {
      return false;
    }
    partyId = party.id;
    await db.insert(partyIdentities).values(
      identities.map((identity) => ({
        orgId,
        partyId: party.id,
        kind: identity.kind,
        value: identity.value,
      })),
    );
  }

  const [leadRow] = await db
    .insert(leads)
    .values({
      orgId,
      partyId,
      source: 'CHANNEL',
      channel,
      notes: lead.message ?? null,
    })
    .returning();
  if (!leadRow) {
    return false;
  }
  await db.insert(timelineEvents).values({
    orgId,
    entityType: 'LEAD',
    entityId: leadRow.id,
    eventType: 'LEAD_CREATED',
    payload: { channel, referenceId: lead.referenceId },
  });
  return true;
}

/** Executa um ciclo de jobs de canal. Retorna quantos foram processados. */
export async function runChannelJobs(opts: RunChannelJobsOptions): Promise<{ processed: number }> {
  const { db, adapterFor, limit = 1, log } = opts;
  const jobs = await claimJobs(db, limit);
  let processed = 0;

  for (const job of jobs) {
    const adapter = adapterFor(job.channel);
    if (!adapter) {
      await markJobFailed(db, job.id, 'Canal não configurado');
      processed += 1;
      continue;
    }
    try {
      switch (job.jobType) {
        case 'PUBLISH': {
          if (!job.listingId) throw new DomainError('INVALID_INPUT', 'PUBLISH exige listing');
          const listing = await loadListing(db, job.orgId, job.listingId);
          const input = await buildChannelListingInput(db, job.orgId, listing);
          const validation = await adapter.validate(input);
          if (!validation.valid) {
            throw new DomainError('INVALID_INPUT', validation.errors.join('; '));
          }
          const result = await adapter.publish(input);
          await updatePublication(db, job.orgId, job.listingId, job.channel, 'PUBLISHED', {
            channelListingId: result.channelListingId,
            lastPayload: input,
          });
          break;
        }
        case 'UPDATE': {
          if (!job.listingId) throw new DomainError('INVALID_INPUT', 'UPDATE exige listing');
          const publication = await resolvePublication(db, job.orgId, job.listingId, job.channel);
          if (!publication?.channelListingId) {
            throw new DomainError('CONFLICT', 'Publicação sem id no canal');
          }
          const listing = await loadListing(db, job.orgId, job.listingId);
          const input = await buildChannelListingInput(db, job.orgId, listing);
          const result = await adapter.update({
            ...input,
            channelListingId: publication.channelListingId,
          });
          await updatePublication(db, job.orgId, job.listingId, job.channel, 'PUBLISHED', {
            channelListingId: result.channelListingId,
            lastPayload: input,
          });
          break;
        }
        case 'REMOVE': {
          if (!job.listingId) throw new DomainError('INVALID_INPUT', 'REMOVE exige listing');
          const publication = await resolvePublication(db, job.orgId, job.listingId, job.channel);
          await adapter.remove({
            channelListingId: publication?.channelListingId ?? `unknown-${job.id}`,
          });
          await updatePublication(db, job.orgId, job.listingId, job.channel, 'REMOVED', {
            channelListingId: null,
          });
          break;
        }
        case 'RECONCILE': {
          const publication =
            job.listingId !== null
              ? await resolvePublication(db, job.orgId, job.listingId, job.channel)
              : null;
          const result = await adapter.reconcile({
            channelListingId: publication?.channelListingId ?? null,
          });
          if (job.listingId && publication) {
            if (result.status === 'PUBLISHED') {
              await updatePublication(db, job.orgId, job.listingId, job.channel, 'PUBLISHED');
            } else if (result.status === 'REMOVED' || result.status === 'NOT_FOUND') {
              await updatePublication(db, job.orgId, job.listingId, job.channel, 'REMOVED', {
                channelListingId: null,
              });
            } else {
              await updatePublication(db, job.orgId, job.listingId, job.channel, 'FAILED', {
                lastError: `Reconciliação: status ${result.status}`,
              });
            }
          }
          break;
        }
        case 'IMPORT_LEADS': {
          if (!adapter.importLeads) {
            throw new DomainError('INVALID_INPUT', 'Canal não suporta importLeads');
          }
          const { leads: channelLeads } = await adapter.importLeads({});
          let imported = 0;
          for (const lead of channelLeads) {
            if (await importLead(db, job.orgId, job.channel, lead)) {
              imported += 1;
            }
          }
          log?.(`importLeads ${job.channel}: ${String(imported)} leads`);
          break;
        }
        default:
          throw new DomainError('INVALID_INPUT', `Job type desconhecido: ${job.jobType}`);
      }
      await markJobSuccess(db, job.id);
      log?.(`job ${job.id} (${job.channel}:${job.jobType}) OK`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.listingId) {
        await updatePublication(db, job.orgId, job.listingId, job.channel, 'FAILED', {
          lastError: message,
        });
      }
      await markJobFailed(db, job.id, message);
      log?.(`job ${job.id} (${job.channel}:${job.jobType}) FAILED: ${message}`);
    }
    processed += 1;
  }

  return { processed };
}

async function loadListing(
  db: AppDb,
  orgId: string,
  listingId: string,
): Promise<typeof listings.$inferSelect> {
  const [listing] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.orgId, orgId)))
    .limit(1);
  if (!listing) {
    throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
  }
  return listing;
}
