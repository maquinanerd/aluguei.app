import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDb } from '@aluguei/db';
import {
  properties,
  propertyAddresses,
  propertyDraftFields,
  propertyDrafts,
  propertyFinancialTerms,
} from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  citySlug,
  extractPropertyDraftFromTranscript,
  redactPersonalData,
  slugifyPlace,
} from '@aluguei/domain';
import type { AudioDraftFieldKey } from '@aluguei/domain';
import {
  DRAFT_AUDIO_SIZE_LIMIT_BYTES,
  confirmPropertyDraftResponseSchema,
  draftAudioMimeTypeSchema,
  listPropertyDraftsResponseSchema,
  processDraftAudioRequestSchema,
  propertyDraftFieldKeySchema,
  propertyDraftResponseSchema,
  requestDraftAudioUrlRequestSchema,
  updatePropertyDraftFieldsRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';

/**
 * Cadastro de imóvel por áudio (ADR-104).
 *
 * O caminho tem quatro passos e cada um é uma decisão separada de propósito:
 *
 * 1. **Abrir o rascunho** — nasce `CAPTURING`, sem nada dentro.
 * 2. **Subir o áudio** por URL assinada, como toda mídia: o áudio fica no
 *    storage da própria imobiliária, nunca no provedor.
 * 3. **Processar** — transcreve, **redige** CPF/telefone/e-mail e extrai campos.
 *    A transcrição guardada já é a redigida: o que não é guardado não vaza.
 * 4. **Confirmar** — aí, e só aí, nasce o imóvel. A IA sugere; a pessoa decide.
 *
 * Sem provedor com retenção zero declarada (`AI_AUDIO_RETENTION=ZERO`), a rota
 * de processamento recusa. Falha fechada: gravar áudio para mandar a um
 * provedor cujo tratamento a gente não conhece é pior do que não ter o recurso.
 */

/** Áudio ditado: minutos, não horas. */
const EXT_POR_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

const CHAVES = propertyDraftFieldKeySchema.options as readonly AudioDraftFieldKey[];

interface LinhaDeCampo {
  fieldKey: string;
  value: string | null;
  state: string;
  evidence: string | null;
}

function paraResposta(
  draft: {
    id: string;
    status: string;
    transcript: string | null;
    audioKey: string | null;
    audioSeconds: number | null;
    failureReason: string | null;
    propertyId: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  campos: LinhaDeCampo[],
): unknown {
  return {
    id: draft.id,
    status: draft.status,
    transcript: draft.transcript,
    audioKey: draft.audioKey,
    audioSeconds: draft.audioSeconds,
    failureReason: draft.failureReason,
    propertyId: draft.propertyId,
    fields: campos.map((campo) => ({
      key: campo.fieldKey,
      value: campo.value,
      state: campo.state,
      evidence: campo.evidence,
    })),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

async function carregar(db: AppDb, orgId: string, id: string) {
  const [draft] = await db
    .select()
    .from(propertyDrafts)
    .where(and(eq(propertyDrafts.id, id), eq(propertyDrafts.orgId, orgId)))
    .limit(1);
  if (!draft) {
    throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
  }
  const campos = await db
    .select({
      fieldKey: propertyDraftFields.fieldKey,
      value: propertyDraftFields.value,
      state: propertyDraftFields.state,
      evidence: propertyDraftFields.evidence,
    })
    .from(propertyDraftFields)
    .where(eq(propertyDraftFields.draftId, id));
  // Ordem do contrato, não a do banco: a tela agrupa por seção e a ordem é parte
  // da leitura.
  const porChave = new Map(campos.map((campo) => [campo.fieldKey, campo]));
  const ordenados = CHAVES.map(
    (chave) =>
      porChave.get(chave) ?? { fieldKey: chave, value: null, state: 'MISSING', evidence: null },
  );
  return { draft, campos: ordenados };
}

const inteiro = (valor: string | null): number | null => {
  if (valor === null || valor.trim() === '') {
    return null;
  }
  const n = Number(valor);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

const booleano = (valor: string | null): boolean | null =>
  valor === 'true' ? true : valor === 'false' ? false : null;

export const propertyDraftRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/property-drafts',
    { onRequest: [requirePermission('property:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      if (!app.audioAi) {
        throw new DomainError(
          'INVALID_INPUT',
          'Cadastro por áudio indisponível: nenhum provedor com retenção zero configurado',
        );
      }
      const [criado] = await db
        .insert(propertyDrafts)
        .values({ orgId: auth.orgId, createdByUserId: auth.userId })
        .returning();
      if (!criado) {
        throw new DomainError('INVALID_INPUT', 'Não foi possível abrir o rascunho');
      }
      return reply.code(201).send(
        propertyDraftResponseSchema.parse({
          draft: paraResposta(criado, []),
        }),
      );
    },
  );

  app.get(
    '/property-drafts',
    { onRequest: [requirePermission('property:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const linhas = await db
        .select()
        .from(propertyDrafts)
        .where(eq(propertyDrafts.orgId, auth.orgId))
        .orderBy(desc(propertyDrafts.createdAt))
        .limit(50);
      return listPropertyDraftsResponseSchema.parse({
        drafts: linhas.map((linha) => paraResposta(linha, [])),
      });
    },
  );

  app.get(
    '/property-drafts/:id',
    { onRequest: [requirePermission('property:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const { draft, campos } = await carregar(db, auth.orgId, id);
      return propertyDraftResponseSchema.parse({ draft: paraResposta(draft, campos) });
    },
  );

  app.post(
    '/property-drafts/:id/audio-url',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = requestDraftAudioUrlRequestSchema.parse(request.body);
      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      if (input.sizeBytes > DRAFT_AUDIO_SIZE_LIMIT_BYTES) {
        throw new DomainError('INVALID_INPUT', 'Áudio excede o limite de 25MB');
      }
      const { draft } = await carregar(db, auth.orgId, id);
      if (draft.status !== 'CAPTURING') {
        throw new DomainError('CONFLICT', 'O rascunho já foi enviado para processamento');
      }
      // Chave sempre do servidor: o cliente não escolhe onde escreve.
      const ext = EXT_POR_MIME[input.mimeType] ?? 'bin';
      const key = `orgs/${auth.orgId}/property-drafts/${draft.id}/audio/${randomUUID()}.${ext}`;
      const { url, expiresIn } = await app.storage.getPresignedPutUrl({
        key,
        contentType: input.mimeType,
      });
      return { url, key, expiresIn };
    },
  );

  app.post(
    '/property-drafts/:id/process',
    {
      onRequest: [requirePermission('property:write')],
      // Transcrever custa: a rota é mais apertada que o padrão.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = processDraftAudioRequestSchema.parse(request.body);

      const transcritor = app.audioAi;
      if (!transcritor) {
        // A trava do ADR-104 também vale aqui, e não só ao abrir o rascunho: a
        // configuração pode mudar entre um passo e outro.
        throw new DomainError(
          'INVALID_INPUT',
          'Cadastro por áudio indisponível: nenhum provedor com retenção zero configurado',
        );
      }
      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      const { draft } = await carregar(db, auth.orgId, id);
      if (draft.status !== 'CAPTURING' && draft.status !== 'FAILED') {
        throw new DomainError('CONFLICT', 'Este rascunho já foi processado');
      }
      if (!input.key.startsWith(`orgs/${auth.orgId}/property-drafts/${draft.id}/`)) {
        throw new DomainError('INVALID_INPUT', 'Chave de storage inválida');
      }
      const cabecalho = await app.storage.headObject(input.key);
      if (!cabecalho) {
        throw new DomainError('INVALID_INPUT', 'Áudio não encontrado no storage');
      }
      // O PUT assinado não limita o tamanho: o limite real é conferido aqui.
      if (cabecalho.size > DRAFT_AUDIO_SIZE_LIMIT_BYTES) {
        throw new DomainError('INVALID_INPUT', 'Áudio excede o limite de 25MB');
      }

      await db
        .update(propertyDrafts)
        .set({
          status: 'PROCESSING',
          audioKey: input.key,
          audioSeconds: input.seconds ?? null,
          updatedAt: new Date(),
        })
        .where(eq(propertyDrafts.id, draft.id));

      const audio = await app.storage.getObject(input.key);
      if (!audio) {
        throw new DomainError('INVALID_INPUT', 'Áudio não encontrado no storage');
      }

      try {
        const transcricao = await transcritor.transcribeAudio({
          audio: new Uint8Array(audio),
          mimeType: 'audio/webm',
        });
        // Redigir ANTES de guardar: o que não é guardado não vaza depois.
        const texto = redactPersonalData(transcricao.text);
        const campos = extractPropertyDraftFromTranscript(texto, CHAVES);

        await db.transaction(async (tx) => {
          await tx
            .update(propertyDrafts)
            .set({
              status: 'REVIEW',
              transcript: texto,
              aiProvider: transcritor.name,
              failureReason: null,
              updatedAt: new Date(),
            })
            .where(eq(propertyDrafts.id, draft.id));
          await tx.delete(propertyDraftFields).where(eq(propertyDraftFields.draftId, draft.id));
          await tx.insert(propertyDraftFields).values(
            campos.map((campo) => ({
              orgId: auth.orgId,
              draftId: draft.id,
              fieldKey: campo.key,
              value: campo.value,
              state: campo.state,
              evidence: campo.evidence,
            })),
          );
        });
      } catch (err) {
        // Falha de IA não perde o áudio: dá para tentar de novo com o mesmo arquivo.
        await db
          .update(propertyDrafts)
          .set({
            status: 'FAILED',
            failureReason: err instanceof Error ? err.message : 'Falha ao transcrever',
            updatedAt: new Date(),
          })
          .where(eq(propertyDrafts.id, draft.id));
        throw new DomainError('INVALID_INPUT', 'Não foi possível transcrever o áudio');
      }

      const atualizado = await carregar(db, auth.orgId, id);
      return propertyDraftResponseSchema.parse({
        draft: paraResposta(atualizado.draft, atualizado.campos),
      });
    },
  );

  app.patch(
    '/property-drafts/:id/fields',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updatePropertyDraftFieldsRequestSchema.parse(request.body);
      const { draft } = await carregar(db, auth.orgId, id);
      if (draft.status !== 'REVIEW') {
        throw new DomainError('CONFLICT', 'Só um rascunho em revisão aceita edição');
      }

      await db.transaction(async (tx) => {
        for (const campo of input.fields) {
          const valor =
            campo.value === null || campo.value.trim() === '' ? null : campo.value.trim();
          // Editar é ato de pessoa: o campo passa a valer como EDITADO, e perde a
          // evidência do áudio — ela deixaria de descrever o valor que está lá.
          await tx
            .insert(propertyDraftFields)
            .values({
              orgId: auth.orgId,
              draftId: draft.id,
              fieldKey: campo.key,
              value: valor,
              state: valor === null ? 'MISSING' : 'EDITED',
              evidence: null,
            })
            .onConflictDoUpdate({
              target: [propertyDraftFields.draftId, propertyDraftFields.fieldKey],
              set: {
                value: valor,
                state: valor === null ? 'MISSING' : 'EDITED',
                evidence: null,
                updatedAt: new Date(),
              },
            });
        }
        await tx
          .update(propertyDrafts)
          .set({ updatedAt: new Date() })
          .where(eq(propertyDrafts.id, draft.id));
      });

      const atualizado = await carregar(db, auth.orgId, id);
      return propertyDraftResponseSchema.parse({
        draft: paraResposta(atualizado.draft, atualizado.campos),
      });
    },
  );

  app.post(
    '/property-drafts/:id/confirm',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const { draft, campos } = await carregar(db, auth.orgId, id);
      if (draft.status !== 'REVIEW') {
        throw new DomainError('CONFLICT', 'Só um rascunho em revisão vira imóvel');
      }

      const valorDe = (chave: AudioDraftFieldKey): string | null =>
        campos.find((campo) => campo.fieldKey === chave)?.value ?? null;

      // Título e tipo são o mínimo que o cadastro exige; sem eles a confirmação
      // recusa em vez de criar um imóvel "Sem título" que ninguém acha depois.
      const titulo = valorDe('TITLE');
      const tipo = valorDe('PROPERTY_TYPE');
      if (titulo === null || titulo.trim() === '') {
        throw new DomainError('INVALID_INPUT', 'Informe o título antes de criar o imóvel');
      }
      if (tipo === null) {
        throw new DomainError('INVALID_INPUT', 'Informe o tipo do imóvel antes de criar');
      }

      const propertyId = await db.transaction(async (tx) => {
        const [imovel] = await tx
          .insert(properties)
          .values({
            orgId: auth.orgId,
            title: titulo.trim(),
            propertyType: tipo,
            purpose: valorDe('PURPOSE') ?? 'RENT',
            bedrooms: inteiro(valorDe('BEDROOMS')),
            bathrooms: inteiro(valorDe('BATHROOMS')),
            parkingSpots: inteiro(valorDe('PARKING_SPOTS')),
            totalAreaSqm: inteiro(valorDe('TOTAL_AREA_SQM')),
            furnished: booleano(valorDe('FURNISHED')) ?? false,
            petsAllowed: booleano(valorDe('PETS_ALLOWED')),
          })
          .returning();
        if (!imovel) {
          throw new DomainError('INVALID_INPUT', 'Não foi possível criar o imóvel');
        }

        const rua = valorDe('STREET');
        const numero = valorDe('NUMBER');
        const bairro = valorDe('NEIGHBORHOOD');
        const cidade = valorDe('CITY');
        const uf = valorDe('STATE');
        if (rua !== null || bairro !== null || cidade !== null) {
          // Rua e número vão para o endereço **privado**; a vitrine mostra
          // bairro e cidade. O corretor dita o endereço inteiro, e é aqui que a
          // separação entre o que é da imobiliária e o que é público acontece.
          await tx.insert(propertyAddresses).values({
            orgId: auth.orgId,
            propertyId: imovel.id,
            isPublic: false,
            street: rua,
            number: numero,
            complement: valorDe('COMPLEMENT'),
            neighborhood: bairro,
            city: cidade,
            state: uf,
            zipCode: valorDe('ZIP_CODE'),
            country: 'BR',
            citySlug: cidade !== null && uf !== null ? citySlug(cidade, uf) : null,
            neighborhoodSlug: bairro !== null ? slugifyPlace(bairro) || null : null,
          });
          if (bairro !== null || cidade !== null) {
            await tx.insert(propertyAddresses).values({
              orgId: auth.orgId,
              propertyId: imovel.id,
              isPublic: true,
              neighborhood: bairro,
              city: cidade,
              state: uf,
              country: 'BR',
              citySlug: cidade !== null && uf !== null ? citySlug(cidade, uf) : null,
              neighborhoodSlug: bairro !== null ? slugifyPlace(bairro) || null : null,
            });
          }
        }

        const aluguel = inteiro(valorDe('MONTHLY_RENT_CENTS'));
        const venda = inteiro(valorDe('SALE_PRICE_CENTS'));
        const condominio = inteiro(valorDe('CONDO_FEE_CENTS'));
        const iptu = inteiro(valorDe('IPTU_CENTS'));
        if (aluguel !== null || venda !== null || condominio !== null || iptu !== null) {
          await tx.insert(propertyFinancialTerms).values({
            orgId: auth.orgId,
            propertyId: imovel.id,
            monthlyRentCents: aluguel,
            salePriceCents: venda,
            condoFeeCents: condominio,
            iptuCents: iptu,
          });
        }

        await tx
          .update(propertyDrafts)
          .set({ status: 'CONFIRMED', propertyId: imovel.id, updatedAt: new Date() })
          .where(eq(propertyDrafts.id, draft.id));

        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PROPERTY_CREATED,
          entityType: 'PROPERTY',
          entityId: imovel.id,
          payload: { fromDraftId: draft.id, aiProvider: draft.aiProvider },
        });

        return imovel.id;
      });

      const atualizado = await carregar(db, auth.orgId, id);
      return confirmPropertyDraftResponseSchema.parse({
        draft: paraResposta(atualizado.draft, atualizado.campos),
        propertyId,
      });
    },
  );

  app.post(
    '/property-drafts/:id/discard',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const { draft } = await carregar(db, auth.orgId, id);
      if (draft.status === 'CONFIRMED') {
        throw new DomainError('CONFLICT', 'Rascunho que virou imóvel não é descartado');
      }
      await db
        .update(propertyDrafts)
        .set({ status: 'DISCARDED', updatedAt: new Date() })
        .where(eq(propertyDrafts.id, draft.id));
      const atualizado = await carregar(db, auth.orgId, id);
      return propertyDraftResponseSchema.parse({
        draft: paraResposta(atualizado.draft, atualizado.campos),
      });
    },
  );

  return Promise.resolve();
};

export const DRAFT_AUDIO_MIME = draftAudioMimeTypeSchema;
