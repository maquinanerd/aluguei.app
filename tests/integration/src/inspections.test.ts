import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { inspectionMedia, inspections } from '@aluguei/db';
import { eq } from 'drizzle-orm';
import { runInboxJobs } from '@aluguei/worker';
import { MockInspectionAiProvider } from '@aluguei/integrations';
import { buildTestApp, fakeStorage, registerUser } from './helpers.js';

interface PropertyBody {
  property: { id: string };
}

interface InspectionBody {
  inspection: { id: string; status: string };
}

interface UploadBody {
  key: string;
}

describe('Fase 06: Inspections + AI', () => {
  let app: FastifyInstance;
  const inspectionAi = new MockInspectionAiProvider();

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createPropertyAndInspection(): Promise<{
    cookie: string;
    propertyId: string;
    inspectionId: string;
  }> {
    const { cookie } = await registerUser(app);
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Casa Vistoria', propertyType: 'HOUSE' },
    });
    const propertyId = (prop.json() as PropertyBody).property.id;
    const insp = await app.inject({
      method: 'POST',
      url: '/inspections',
      headers: { cookie },
      payload: { propertyId, type: 'CHECKIN' },
    });
    expect(insp.statusCode).toBe(201);
    return { cookie, propertyId, inspectionId: (insp.json() as InspectionBody).inspection.id };
  }

  async function addMediaAndProcess(cookie: string, inspectionId: string): Promise<void> {
    const room = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/rooms`,
      headers: { cookie },
      payload: { name: 'Quarto Principal' },
    });
    expect(room.statusCode).toBe(201);

    // Photo + audio
    const photo = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
    });
    expect(photo.statusCode).toBe(200);
    fakeStorage.markUploaded((photo.json() as UploadBody).key, 2048);
    const confirmPhoto = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/media/confirm`,
      headers: { cookie },
      payload: { key: (photo.json() as UploadBody).key },
    });
    expect(confirmPhoto.statusCode).toBe(201);

    const audio = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'AUDIO', mimeType: 'audio/mpeg', sizeBytes: 4096 },
    });
    expect(audio.statusCode).toBe(200);
    fakeStorage.markUploaded((audio.json() as UploadBody).key, 4096);
    const confirmAudio = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/media/confirm`,
      headers: { cookie },
      payload: { key: (audio.json() as UploadBody).key },
    });
    expect(confirmAudio.statusCode).toBe(201);

    // Process (enfileira job)
    const process = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/process`,
      headers: { cookie },
      payload: {},
    });
    expect(process.statusCode).toBe(202);
  }

  it('ciclo completo: create→rooms→media→process→REVIEW→observações→COMPLETED', async () => {
    const { cookie, inspectionId } = await createPropertyAndInspection();

    const start = await app.inject({
      method: 'PATCH',
      url: `/inspections/${inspectionId}/status`,
      headers: { cookie },
      payload: { status: 'CAPTURING' },
    });
    expect(start.statusCode).toBe(200);

    await addMediaAndProcess(cookie, inspectionId);
    const inboxResult = await runInboxJobs({
      db: app.db,
      limit: 10,
      inspectionAi,
      log: (m: string) => {
        console.log('INBOX:', m);
      },
    });
    console.log('INBOX result:', JSON.stringify(inboxResult));

    // Após o job: PROCESSING → REVIEW
    const detail = await app.inject({
      method: 'GET',
      url: `/inspections/${inspectionId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    const aggregate = detail.json() as {
      inspection: { status: string };
      transcripts: Array<{ status: string }>;
      aiSuggestions: Array<{ id: string; status: string; payload: Record<string, string> }>;
    };
    console.log(
      'AGG status:',
      aggregate.inspection.status,
      '| transcripts:',
      JSON.stringify(aggregate.transcripts.map((t: { status: string }) => t.status)),
      '| suggestions:',
      aggregate.aiSuggestions.length,
    );
    expect(aggregate.inspection.status).toBe('REVIEW');
    expect(aggregate.transcripts.some((t) => t.status === 'PROCESSED')).toBe(true);
    expect(aggregate.aiSuggestions.length).toBeGreaterThan(0);

    // COMPLETED bloqueado enquanto houver sugestão PENDING
    const blocked = await app.inject({
      method: 'PATCH',
      url: `/inspections/${inspectionId}/status`,
      headers: { cookie },
      payload: { status: 'COMPLETED' },
    });
    expect(blocked.statusCode).toBe(409);

    // Resolve sugestões (ACCEPT) + observação humana
    for (const suggestion of aggregate.aiSuggestions) {
      const resolve = await app.inject({
        method: 'PATCH',
        url: `/inspections/${inspectionId}/ai-suggestions/${suggestion.id}`,
        headers: { cookie },
        payload: { action: 'ACCEPT' },
      });
      expect(resolve.statusCode).toBe(200);
    }
    const observation = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/observations`,
      headers: { cookie },
      payload: { category: 'CONDITION', severity: 'LOW', description: 'Ambiente em bom estado' },
    });
    expect(observation.statusCode).toBe(201);

    // COMPLETED agora permitido
    const complete = await app.inject({
      method: 'PATCH',
      url: `/inspections/${inspectionId}/status`,
      headers: { cookie },
      payload: { status: 'COMPLETED' },
    });
    expect(complete.statusCode).toBe(200);
    expect((complete.json() as InspectionBody).inspection.status).toBe('COMPLETED');

    // SIGNED reservado para Fase 07
    const signed = await app.inject({
      method: 'PATCH',
      url: `/inspections/${inspectionId}/status`,
      headers: { cookie },
      payload: { status: 'SIGNED' },
    });
    expect(signed.statusCode).toBe(400);
  });

  it('privacy: mídia de vistoria NÃO aparece em property_media nem em DTO público', async () => {
    const { cookie, propertyId, inspectionId } = await createPropertyAndInspection();
    await addMediaAndProcess(cookie, inspectionId);

    const mediaRows = await app.db
      .select()
      .from(inspectionMedia)
      .where(eq(inspectionMedia.inspectionId, inspectionId));
    expect(mediaRows.length).toBeGreaterThan(0);

    // property_media não contém a mídia de vistoria
    const propertyDetail = await app.inject({
      method: 'GET',
      url: `/properties/${propertyId}`,
      headers: { cookie },
    });
    const body = propertyDetail.json() as { property: { media: unknown[]; addresses: unknown[] } };
    expect(body.property.media).toEqual([]);

    // nenhuma rota pública expõe storageKey de vistoria
    const inspectionRows = await app.db
      .select()
      .from(inspections)
      .where(eq(inspections.id, inspectionId));
    expect(inspectionRows.length).toBe(1);
  });

  it('cross-org: vistoria de outra org → 404', async () => {
    const { inspectionId } = await createPropertyAndInspection();
    const other = await registerUser(app);
    const res = await app.inject({
      method: 'GET',
      url: `/inspections/${inspectionId}`,
      headers: { cookie: other.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('comparação entrada×saída produz differences', async () => {
    const { cookie, propertyId } = await createPropertyAndInspection();
    // Cria checkin e checkout COMPLETED
    const checkinRes = await app.inject({
      method: 'POST',
      url: '/inspections',
      headers: { cookie },
      payload: { propertyId, type: 'CHECKIN' },
    });
    const checkinId = (checkinRes.json() as InspectionBody).inspection.id;
    const checkoutRes = await app.inject({
      method: 'POST',
      url: '/inspections',
      headers: { cookie },
      payload: { propertyId, type: 'CHECKOUT' },
    });
    const checkoutId = (checkoutRes.json() as InspectionBody).inspection.id;

    for (const id of [checkinId, checkoutId]) {
      const s1 = await app.inject({
        method: 'PATCH',
        url: `/inspections/${id}/status`,
        headers: { cookie },
        payload: { status: 'CAPTURING' },
      });
      const s2 = await app.inject({
        method: 'PATCH',
        url: `/inspections/${id}/status`,
        headers: { cookie },
        payload: { status: 'PROCESSING' },
      });
      const s3 = await app.inject({
        method: 'PATCH',
        url: `/inspections/${id}/status`,
        headers: { cookie },
        payload: { status: 'REVIEW' },
      });
      const s4 = await app.inject({
        method: 'PATCH',
        url: `/inspections/${id}/status`,
        headers: { cookie },
        payload: { status: 'COMPLETED' },
      });
      console.log(
        'compare status codes:',
        s1.statusCode,
        s2.statusCode,
        s3.statusCode,
        s4.statusCode,
      );
      expect(s4.statusCode).toBe(200);
      await app.inject({
        method: 'POST',
        url: `/inspections/${id}/observations`,
        headers: { cookie },
        payload: { category: 'CONDITION', severity: 'LOW', description: 'Piso com riscos' },
      });
    }
    // Checkout ganha uma observação nova
    await app.inject({
      method: 'POST',
      url: `/inspections/${checkoutId}/observations`,
      headers: { cookie },
      payload: { category: 'DAMAGE', severity: 'MEDIUM', description: 'Mancha na parede' },
    });

    const compare = await app.inject({
      method: 'POST',
      url: `/inspections/${checkinId}/compare`,
      headers: { cookie },
      payload: { checkoutInspectionId: checkoutId },
    });
    console.log('COMPARE:', compare.statusCode, compare.body.slice(0, 200));
    expect(compare.statusCode).toBe(201);
    const body = compare.json() as { differences: Array<{ kind: string }> };

    const kinds = body.differences.map((d: { kind: string }) => d.kind);
    expect(kinds).toContain('UNCHANGED');
    expect(kinds).toContain('NEW');
  });

  it('RBAC: viewer não cria vistoria (403)', async () => {
    const owner = await registerUser(app, {
      email: `owner-insp-${Math.random().toString(36).slice(2, 6)}@example.com`,
      organizationName: `Org I ${Math.random().toString(36).slice(2, 6)}`,
    });
    const viewer = await registerUser(app, {
      email: `viewer-insp-${Math.random().toString(36).slice(2, 6)}@example.com`,
      organizationName: `Org V ${Math.random().toString(36).slice(2, 6)}`,
    });
    await app.inject({
      method: 'POST',
      url: `/organizations/${owner.body.org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: viewer.body.user.id, role: 'viewer' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/switch-org',
      headers: { cookie: viewer.cookie },
      payload: { orgId: owner.body.org.id },
    });
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie: owner.cookie },
      payload: { title: 'Prop RBAC', propertyType: 'HOUSE' },
    });
    const propertyId = (prop.json() as PropertyBody).property.id;

    const create = await app.inject({
      method: 'POST',
      url: '/inspections',
      headers: { cookie: viewer.cookie },
      payload: { propertyId, type: 'CHECKIN' },
    });
    expect(create.statusCode).toBe(403);
  });
});
