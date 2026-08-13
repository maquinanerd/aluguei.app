import { beforeAll, describe, expect, it } from 'vitest';
import { FakeChannel } from '@aluguei/integrations';
import type { IListingChannelAdapter } from '@aluguei/integrations';
import { createTestDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { eq } from 'drizzle-orm';
import {
  channelSyncJobs,
  listingChannelPublications,
  listings,
  organizations,
  properties,
  propertyAddresses,
  propertyFinancialTerms,
} from '@aluguei/db';
import { runChannelJobs } from './channelJobs.js';
import { enqueueChannelJob } from '@aluguei/api/channel-jobs';

async function seedJob(
  db: AppDb,
  values: Partial<typeof channelSyncJobs.$inferInsert> & {
    orgId: string;
    channel: string;
    jobType: string;
  },
): Promise<string> {
  const [job] = await db
    .insert(channelSyncJobs)
    .values({
      orgId: values.orgId,
      listingId: values.listingId ?? null,
      channel: values.channel,
      jobType: values.jobType,
      idempotencyKey: values.idempotencyKey ?? `k-${Math.random().toString(36).slice(2)}`,
      payload: values.payload ?? null,
    })
    .returning();
  if (!job) {
    throw new Error('seed failed');
  }
  return job.id;
}

describe('worker: channel jobs (claim no Postgres, sem Redis)', () => {
  let db: AppDb;
  let fake: FakeChannel;
  let orgId: string;
  let listingId: string;

  beforeAll(async () => {
    db = await createTestDb();
    fake = new FakeChannel();
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org Jobs', slug: 'org-jobs' })
      .returning();
    if (!org) throw new Error('org seed failed');
    orgId = org.id;
    const [property] = await db
      .insert(properties)
      .values({ orgId, title: 'Casa Jobs', propertyType: 'HOUSE' })
      .returning();
    if (!property) throw new Error('property seed failed');
    await db
      .insert(propertyFinancialTerms)
      .values({ orgId, propertyId: property.id, monthlyRentCents: 250000 });
    await db.insert(propertyAddresses).values({
      orgId,
      propertyId: property.id,
      city: 'São Paulo',
      neighborhood: 'Centro',
      isPublic: true,
    });
    const [listing] = await db
      .insert(listings)
      .values({ orgId, propertyId: property.id, title: 'Casa Jobs', slug: 'casa-jobs' })
      .returning();
    if (!listing) throw new Error('listing seed failed');
    listingId = listing.id;
  });

  it('processa job PUBLISH e atualiza publication para PUBLISHED', async () => {
    const jobId = await seedJob(db, { orgId, listingId, channel: 'fake', jobType: 'PUBLISH' });

    const { processed } = await runChannelJobs({
      db,
      adapterFor: (channel) => (channel === 'fake' ? (fake as IListingChannelAdapter) : null),
      limit: 10,
    });
    expect(processed).toBe(1);

    const [job] = await db
      .select()
      .from(channelSyncJobs)
      .where(eq(channelSyncJobs.id, jobId))
      .limit(1);
    expect(job?.status).toBe('SUCCESS');
    const [publication] = await db
      .select()
      .from(listingChannelPublications)
      .where(eq(listingChannelPublications.listingId, listingId))
      .limit(1);
    expect(publication?.status).toBe('PUBLISHED');
    expect(publication?.channelListingId).toBeTruthy();
  });

  it('falha injetada → job FAILED e publication FAILED; retry reusa a linha → SUCCESS', async () => {
    fake.failNext('publish', new Error('boom'));
    const initial = await enqueueChannelJob(db, {
      orgId,
      listingId,
      channel: 'fake',
      jobType: 'PUBLISH',
      payload: { listingId },
    });
    const jobId = initial.id;

    await runChannelJobs({ db, adapterFor: (c) => (c === 'fake' ? fake : null), limit: 10 });
    const [failed] = await db
      .select()
      .from(channelSyncJobs)
      .where(eq(channelSyncJobs.id, jobId))
      .limit(1);
    expect(failed?.status).toBe('FAILED');
    const [pubFailed] = await db
      .select()
      .from(listingChannelPublications)
      .where(eq(listingChannelPublications.listingId, listingId))
      .limit(1);
    expect(pubFailed?.status).toBe('FAILED');

    // Retry: re-enfileira com a MESMA idempotency_key → reusa a linha (sem duplicar).
    await enqueueChannelJob(db, {
      orgId,
      listingId,
      channel: 'fake',
      jobType: 'PUBLISH',
      payload: { listingId },
    });
    const sameKeyJobs = await db
      .select()
      .from(channelSyncJobs)
      .where(eq(channelSyncJobs.idempotencyKey, initial.idempotencyKey));
    expect(sameKeyJobs.length).toBe(1); // retry reusa a linha — nenhuma duplicação
    expect(sameKeyJobs[0]?.status).toBe('PENDING');

    await runChannelJobs({ db, adapterFor: (c) => (c === 'fake' ? fake : null), limit: 10 });
    const [retried] = await db
      .select()
      .from(channelSyncJobs)
      .where(eq(channelSyncJobs.id, jobId))
      .limit(1);
    expect(retried?.status).toBe('SUCCESS');
    const [pubOk] = await db
      .select()
      .from(listingChannelPublications)
      .where(eq(listingChannelPublications.listingId, listingId))
      .limit(1);
    expect(pubOk?.status).toBe('PUBLISHED');
  });
});
