import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  inspections,
  inspectionMedia,
  inspectionTranscripts,
  inspectionAiSuggestions,
  inspectionRooms,
} from '@aluguei/db';
import { isInspectionStatus, transitionInspection } from '@aluguei/domain';
import type { InspectionStatus } from '@aluguei/domain';
import type { InspectionAiProvider } from '@aluguei/integrations';

export interface InspectionJob {
  id: string;
  orgId: string;
  payload: Record<string, unknown>;
}

/**
 * Processa uma vistoria: transcreve áudios sem transcript e gera sugestões
 * para PHOTO/VIDEO sem sugestões (skip = idempotência). Ao final aplica
 * PROCESSING → REVIEW via máquina de estado.
 */
export async function processInspectionJob(
  db: AppDb,
  job: InspectionJob,
  ai: InspectionAiProvider,
): Promise<void> {
  const rawInspectionId = job.payload['inspectionId'];
  const inspectionId = typeof rawInspectionId === 'string' ? rawInspectionId : '';
  if (!inspectionId) {
    throw new Error('job sem inspectionId');
  }
  const [inspection] = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.id, inspectionId), eq(inspections.orgId, job.orgId)))
    .limit(1);
  if (!inspection) {
    return; // inspeção removida — job vira SUCCESS
  }
  const media = await db
    .select()
    .from(inspectionMedia)
    .where(eq(inspectionMedia.inspectionId, inspectionId));

  // 1. Transcrições de áudio (skip por UNIQUE(media_id)).
  const audioMedia = media.filter((item) => item.kind === 'AUDIO');
  for (const audio of audioMedia) {
    const [existing] = await db
      .select()
      .from(inspectionTranscripts)
      .where(eq(inspectionTranscripts.mediaId, audio.id))
      .limit(1);
    if (existing) {
      continue; // já transcrito (retry não duplica)
    }
    try {
      const result = await ai.transcribeAudio({
        storageKey: audio.storageKey,
        mimeType: audio.mimeType ?? 'audio/mpeg',
      });
      await db.insert(inspectionTranscripts).values({
        orgId: job.orgId,
        inspectionId,
        mediaId: audio.id,
        text: result.text,
        status: 'PROCESSED',
        aiModel: result.aiModel,
      });
    } catch (err) {
      await db.insert(inspectionTranscripts).values({
        orgId: job.orgId,
        inspectionId,
        mediaId: audio.id,
        text: '',
        status: 'FAILED',
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
    }
  }

  // 2. Sugestões visuais (skip por mídia já sugerida).
  const visualMedia = media.filter((item) => item.kind === 'PHOTO' || item.kind === 'VIDEO');
  for (const item of visualMedia) {
    const [existing] = await db
      .select()
      .from(inspectionAiSuggestions)
      .where(
        and(
          eq(inspectionAiSuggestions.mediaId, item.id),
          eq(inspectionAiSuggestions.kind, 'VISUAL'),
        ),
      )
      .limit(1);
    if (existing) {
      continue; // já sugerido
    }
    const [room] = item.roomId
      ? await db.select().from(inspectionRooms).where(eq(inspectionRooms.id, item.roomId)).limit(1)
      : [undefined];
    const suggestionInput: Parameters<typeof ai.suggestObservations>[0] = {
      storageKey: item.storageKey,
      kind: item.kind === 'VIDEO' ? 'VIDEO' : 'PHOTO',
    };
    if (room?.name) {
      suggestionInput.roomName = room.name;
    }
    const suggestions = await ai.suggestObservations(suggestionInput);
    for (const suggestion of suggestions) {
      await db.insert(inspectionAiSuggestions).values({
        orgId: job.orgId,
        inspectionId,
        mediaId: item.id,
        kind: 'VISUAL',
        payload: {
          category: suggestion.category,
          severity: suggestion.severity,
          description: suggestion.description,
          evidence: [item.storageKey],
        },
        confidence: suggestion.confidence,
        status: 'PENDING',
      });
    }
  }

  // 3. Transição PROCESSING → REVIEW (guards: nada PENDING).
  if (isInspectionStatus(inspection.status) && inspection.status === 'PROCESSING') {
    const [pendingTranscripts, pendingSuggestions] = await Promise.all([
      db
        .select({ count: inspectionTranscripts.id })
        .from(inspectionTranscripts)
        .where(
          and(
            eq(inspectionTranscripts.inspectionId, inspectionId),
            eq(inspectionTranscripts.status, 'PENDING'),
          ),
        ),
      db
        .select({ count: inspectionAiSuggestions.id })
        .from(inspectionAiSuggestions)
        .where(
          and(
            eq(inspectionAiSuggestions.inspectionId, inspectionId),
            eq(inspectionAiSuggestions.status, 'PENDING'),
          ),
        ),
    ]);
    try {
      transitionInspection('PROCESSING', 'REVIEW', {
        pendingTranscripts: pendingTranscripts.length,
        pendingSuggestions: pendingSuggestions.length,
        draftObservations: 0,
      });
      await db
        .update(inspections)
        .set({ status: 'REVIEW', updatedAt: new Date() })
        .where(eq(inspections.id, inspectionId));
    } catch {
      // Ficou algo PENDING (ex.: job concorrente) — próxima execução tenta de novo.
    }
  }
}

export type { InspectionStatus };
