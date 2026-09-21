import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { MockInspectionAiProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakeStorage, registerUser } from './helpers.js';

/**
 * G3, trilha E (auditoria 2026-09-10, P1-24): a evidência da vistoria continuava editável depois de
 * COMPLETED — ambiente novo, mídia nova, mídia apagada, observação nova e sugestão de IA reaberta —
 * e a remoção de mídia não deixava rastro na auditoria. Relatório assinado precisa de evidência
 * imutável.
 */
describe('G3 trilha E — evidência de vistoria imutável depois de concluída', () => {
  let app: FastifyInstance;
  const inspectionAi = new MockInspectionAiProvider();

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function inspectionInReview(): Promise<{
    cookie: string;
    inspectionId: string;
    roomId: string;
    photoMediaId: string;
  }> {
    const { cookie } = await registerUser(app);
    const property = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Casa Imutável', propertyType: 'HOUSE' },
    });
    const propertyId = (property.json() as { property: { id: string } }).property.id;
    const created = await app.inject({
      method: 'POST',
      url: '/inspections',
      headers: { cookie },
      payload: { propertyId, type: 'CHECKIN' },
    });
    expect(created.statusCode).toBe(201);
    const inspectionId = (created.json() as { inspection: { id: string } }).inspection.id;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/inspections/${inspectionId}/status`,
          headers: { cookie },
          payload: { status: 'CAPTURING' },
        })
      ).statusCode,
    ).toBe(200);

    const room = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/rooms`,
      headers: { cookie },
      payload: { name: 'Sala' },
    });
    expect(room.statusCode).toBe(201);
    const roomId = (room.json() as { room: { id: string } }).room.id;

    const media = async (kind: string, mimeType: string, sizeBytes: number): Promise<string> => {
      const upload = await app.inject({
        method: 'POST',
        url: `/inspections/${inspectionId}/media/upload-url`,
        headers: { cookie },
        payload: { kind, mimeType, sizeBytes },
      });
      expect(upload.statusCode).toBe(200);
      const key = (upload.json() as { key: string }).key;
      fakeStorage.markUploaded(key, sizeBytes);
      const confirmed = await app.inject({
        method: 'POST',
        url: `/inspections/${inspectionId}/media/confirm`,
        headers: { cookie },
        payload: { key },
      });
      expect(confirmed.statusCode).toBe(201);
      return (confirmed.json() as { media: { id: string } }).media.id;
    };
    const photoMediaId = await media('PHOTO', 'image/jpeg', 2048);
    await media('AUDIO', 'audio/mpeg', 4096);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/inspections/${inspectionId}/process`,
          headers: { cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(202);
    await runInboxJobs({ db: app.db, limit: 10, inspectionAi });
    const detail = await app.inject({
      method: 'GET',
      url: `/inspections/${inspectionId}`,
      headers: { cookie },
    });
    expect((detail.json() as { inspection: { status: string } }).inspection.status).toBe('REVIEW');
    return { cookie, inspectionId, roomId, photoMediaId };
  }

  it('remover mídia com a vistoria em revisão fica registrado na auditoria', async () => {
    const { cookie, inspectionId, photoMediaId } = await inspectionInReview();
    const removed = await app.inject({
      method: 'DELETE',
      url: `/inspections/${inspectionId}/media/${photoMediaId}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(200);

    const audit = await app.db.execute(sql`
      select action, payload from audit_events
      where entity_type = 'INSPECTION' and entity_id = ${inspectionId}
        and action = 'inspection.media_removed'
    `);
    expect(audit.rows).toHaveLength(1);
    expect((audit.rows[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      mediaId: photoMediaId,
    });
  });

  it('vistoria concluída recusa ambiente, mídia, observação e sugestão, e nada é apagado', async () => {
    const { cookie, inspectionId, roomId, photoMediaId } = await inspectionInReview();
    const observation = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/observations`,
      headers: { cookie },
      payload: {
        roomId,
        mediaId: photoMediaId,
        category: 'CONDITION',
        severity: 'LOW',
        description: 'Parede com marca de quadro',
      },
    });
    expect(observation.statusCode, observation.body).toBe(201);
    // Concluir exige resolver as sugestões de IA pendentes.
    const detailBefore = await app.inject({
      method: 'GET',
      url: `/inspections/${inspectionId}`,
      headers: { cookie },
    });
    const pending = (detailBefore.json() as { aiSuggestions: Array<{ id: string }> }).aiSuggestions;
    expect(pending.length).toBeGreaterThan(0);
    for (const suggestion of pending) {
      const resolved = await app.inject({
        method: 'PATCH',
        url: `/inspections/${inspectionId}/ai-suggestions/${suggestion.id}`,
        headers: { cookie },
        payload: { action: 'REJECT' },
      });
      expect(resolved.statusCode, resolved.body).toBe(200);
    }

    const completed = await app.inject({
      method: 'PATCH',
      url: `/inspections/${inspectionId}/status`,
      headers: { cookie },
      payload: { status: 'COMPLETED' },
    });
    expect(completed.statusCode, completed.body).toBe(200);

    const refused: Array<[string, number]> = [];
    const room = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/rooms`,
      headers: { cookie },
      payload: { name: 'Ambiente depois do fim' },
    });
    refused.push(['POST /rooms', room.statusCode]);
    const uploadUrl = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 1024 },
    });
    refused.push(['POST /media/upload-url', uploadUrl.statusCode]);
    const confirm = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/media/confirm`,
      headers: { cookie },
      payload: { key: `inspections/${inspectionId}/depois.jpg` },
    });
    refused.push(['POST /media/confirm', confirm.statusCode]);
    const remove = await app.inject({
      method: 'DELETE',
      url: `/inspections/${inspectionId}/media/${photoMediaId}`,
      headers: { cookie },
    });
    refused.push(['DELETE /media/:mediaId', remove.statusCode]);
    const newObservation = await app.inject({
      method: 'POST',
      url: `/inspections/${inspectionId}/observations`,
      headers: { cookie },
      payload: {
        roomId,
        mediaId: photoMediaId,
        category: 'DAMAGE',
        severity: 'HIGH',
        description: 'Observação depois do fim',
      },
    });
    refused.push(['POST /observations', newObservation.statusCode]);
    // Sugestão nova, ainda pendente, chegando depois do fim: também não entra.
    const [fresh] = (
      await app.db.execute(sql`
        insert into inspection_ai_suggestions (id, org_id, inspection_id, kind, payload, status)
        select gen_random_uuid(), org_id, id, 'VISUAL', '{"description":"depois do fim"}'::jsonb, 'PENDING'
        from inspections where id = ${inspectionId}
        returning id
      `)
    ).rows as Array<{ id: string }>;
    const suggestion = await app.inject({
      method: 'PATCH',
      url: `/inspections/${inspectionId}/ai-suggestions/${fresh?.id ?? ''}`,
      headers: { cookie },
      payload: { action: 'ACCEPT' },
    });
    refused.push(['PATCH /ai-suggestions/:id', suggestion.statusCode]);
    expect(refused).toEqual(refused.map(([name]) => [name, 409]));

    // A evidência continua onde estava.
    const [counts] = (
      await app.db.execute(sql`
        select
          (select count(*)::int from inspection_media where inspection_id = ${inspectionId}) as media,
          (select count(*)::int from inspection_rooms where inspection_id = ${inspectionId}) as rooms,
          (select count(*)::int from inspection_observations where inspection_id = ${inspectionId} and source = 'HUMAN') as observations
      `)
    ).rows as Array<{ media: number; rooms: number; observations: number }>;
    expect(counts).toEqual({ media: 2, rooms: 1, observations: 1 });
  });
});
