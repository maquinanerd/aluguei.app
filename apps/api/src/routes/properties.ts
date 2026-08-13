import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  parties,
  properties,
  propertyAddresses,
  propertyFeatures,
  propertyFinancialTerms,
  propertyMedia,
  propertyOwners,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError } from '@aluguei/domain';
import {
  addFeatureRequestSchema,
  addOwnerRequestSchema,
  confirmMediaRequestSchema,
  createPropertyRequestSchema,
  listPropertiesQuerySchema,
  propertyMediaSchema,
  propertyOwnerSchema,
  propertySchema,
  requestUploadUrlRequestSchema,
  updatePropertyRequestSchema,
  upsertAddressRequestSchema,
  upsertFinancialTermsRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { assertSizeAllowed, buildStorageKey, isPublicMediaKind } from '../media-rules.js';
import { enqueueUpdatesForProperty } from './channel-jobs.js';
import { first } from './helpers.js';

interface LoadedProperty {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  status: string;
  propertyType: string;
  totalAreaSqm: number | null;
  builtAreaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  addresses: Array<Record<string, unknown>>;
  financialTerms: Record<string, unknown> | null;
  owners: Array<Record<string, unknown>>;
  features: string[];
  media: Array<Record<string, unknown>>;
}

async function loadProperty(
  db: AppDb,
  orgId: string,
  propertyId: string,
): Promise<LoadedProperty | null> {
  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!property) {
    return null;
  }
  const [addresses, terms, owners, features, media] = await Promise.all([
    db.select().from(propertyAddresses).where(eq(propertyAddresses.propertyId, propertyId)),
    db
      .select()
      .from(propertyFinancialTerms)
      .where(eq(propertyFinancialTerms.propertyId, propertyId))
      .limit(1),
    db.select().from(propertyOwners).where(eq(propertyOwners.propertyId, propertyId)),
    db
      .select({ feature: propertyFeatures.feature })
      .from(propertyFeatures)
      .where(eq(propertyFeatures.propertyId, propertyId)),
    db.select().from(propertyMedia).where(eq(propertyMedia.propertyId, propertyId)),
  ]);

  const ownerPartyIds = owners.map((o) => o.partyId);
  const ownerParties =
    ownerPartyIds.length > 0
      ? await db.select().from(parties).where(inArray(parties.id, ownerPartyIds))
      : [];
  const partyName = new Map(ownerParties.map((p) => [p.id, p.name]));

  return {
    ...property,
    addresses,
    financialTerms: terms[0] ?? null,
    owners: owners.map((o) => ({ ...o, name: partyName.get(o.partyId) ?? '?' })),
    features: features.map((f) => f.feature),
    media,
  };
}

function toPropertyDto(loaded: LoadedProperty): unknown {
  return propertySchema.parse({
    id: loaded.id,
    orgId: loaded.orgId,
    title: loaded.title,
    description: loaded.description,
    status: loaded.status,
    propertyType: loaded.propertyType,
    totalAreaSqm: loaded.totalAreaSqm,
    builtAreaSqm: loaded.builtAreaSqm,
    bedrooms: loaded.bedrooms,
    bathrooms: loaded.bathrooms,
    parkingSpots: loaded.parkingSpots,
    furnished: loaded.furnished,
    petsAllowed: loaded.petsAllowed,
    createdAt: loaded.createdAt.toISOString(),
    updatedAt: loaded.updatedAt.toISOString(),
    addresses: loaded.addresses.map((a) => toAddressDto(a)),
    financialTerms: loaded.financialTerms ? toTermsDto(loaded.financialTerms) : null,
    owners: loaded.owners.map((o) => propertyOwnerSchema.parse({ ...o, name: o.name ?? '?' })),
    features: loaded.features,
    media: loaded.media.map((m) => propertyMediaSchema.parse(toMediaDto(m))),
  });
}

/**
 * Remove apenas colunas internas (orgId/propertyId/createdAt/updatedAt/storageKey)
 * e lat/lng (nunca expostos). Mantém `id` e nulls (schemas usam `.nullable()`).
 */
function toAddressDto(address: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(address)) {
    if (
      value !== undefined &&
      key !== 'orgId' &&
      key !== 'propertyId' &&
      key !== 'createdAt' &&
      key !== 'updatedAt' &&
      key !== 'lat' &&
      key !== 'lng'
    ) {
      result[key] = value;
    }
  }
  return result;
}

function toTermsDto(terms: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(terms)) {
    if (
      value !== undefined &&
      key !== 'id' &&
      key !== 'orgId' &&
      key !== 'propertyId' &&
      key !== 'updatedAt'
    ) {
      result[key] = value;
    }
  }
  return result;
}

function toMediaDto(media: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(media)) {
    if (
      value !== undefined &&
      key !== 'storageKey' &&
      key !== 'orgId' &&
      key !== 'propertyId' &&
      key !== 'updatedAt'
    ) {
      result[key] = value;
    }
  }
  return result;
}

export const propertyRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/properties',
    { onRequest: [requirePermission('property:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createPropertyRequestSchema.parse(request.body);

      const property = first(
        await db
          .insert(properties)
          .values({
            orgId: auth.orgId,
            title: input.title,
            propertyType: input.propertyType,
            description: input.description ?? null,
            status: input.status ?? 'ACTIVE',
            totalAreaSqm: input.totalAreaSqm ?? null,
            builtAreaSqm: input.builtAreaSqm ?? null,
            bedrooms: input.bedrooms ?? null,
            bathrooms: input.bathrooms ?? null,
            parkingSpots: input.parkingSpots ?? null,
            furnished: input.furnished ?? false,
            petsAllowed: input.petsAllowed ?? null,
          })
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPERTY_CREATED,
        entityType: 'PROPERTY',
        entityId: property.id,
      });

      const loaded = await loadProperty(db, auth.orgId, property.id);
      if (!loaded) {
        throw new Error('property not found after insert');
      }
      return reply.status(201).send({ property: toPropertyDto(loaded) });
    },
  );

  app.get('/properties', { onRequest: [requirePermission('property:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listPropertiesQuerySchema.parse(request.query);
    const where = and(
      eq(properties.orgId, auth.orgId),
      query.status ? eq(properties.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(properties)
      .where(where)
      .orderBy(desc(properties.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return {
      properties: rows.map((row) => summaryOf(row)),
      total: rows.length,
    };
  });

  app.get(
    '/properties/:id',
    { onRequest: [requirePermission('property:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const loaded = await loadProperty(db, auth.orgId, id);
      if (!loaded) {
        throw new DomainError('NOT_FOUND', 'Imóvel não encontrado');
      }
      return { property: toPropertyDto(loaded) };
    },
  );

  app.patch(
    '/properties/:id',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updatePropertyRequestSchema.parse(request.body);

      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
          patch[key] = value;
        }
      }
      const updated = first(
        await db
          .update(properties)
          .set(patch as never)
          .where(eq(properties.id, property.id))
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action:
          patch.status === 'ARCHIVED'
            ? AUDIT_ACTIONS.PROPERTY_ARCHIVED
            : AUDIT_ACTIONS.PROPERTY_UPDATED,
        entityType: 'PROPERTY',
        entityId: updated.id,
      });

      const loaded = await loadProperty(db, auth.orgId, updated.id);
      if (!loaded) {
        throw new Error('property not found after update');
      }
      return { property: toPropertyDto(loaded) };
    },
  );

  app.put(
    '/properties/:id/address',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = upsertAddressRequestSchema.parse(request.body);

      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }

      const apply = async (isPublic: boolean): Promise<void> => {
        const data = isPublic ? input.publicAddress : input.privateAddress;
        if (!data) {
          return;
        }
        const [existing] = await db
          .select()
          .from(propertyAddresses)
          .where(
            and(
              eq(propertyAddresses.propertyId, property.id),
              eq(propertyAddresses.isPublic, isPublic),
            ),
          )
          .limit(1);
        const values = {
          ...data,
          propertyId: property.id,
          orgId: auth.orgId,
          isPublic,
          updatedAt: new Date(),
        };
        if (existing) {
          await db
            .update(propertyAddresses)
            .set(values as never)
            .where(eq(propertyAddresses.id, existing.id));
        } else {
          await db.insert(propertyAddresses).values(values as never);
        }
      };

      await apply(true);
      await apply(false);

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPERTY_ADDRESS_UPDATED,
        entityType: 'PROPERTY',
        entityId: property.id,
      });
      await enqueueUpdatesForProperty(db, auth.orgId, property.id);

      const loaded = await loadProperty(db, auth.orgId, property.id);
      if (!loaded) {
        throw new Error('property not found after address update');
      }
      return { property: toPropertyDto(loaded) };
    },
  );

  app.put(
    '/properties/:id/financial-terms',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = upsertFinancialTermsRequestSchema.parse(request.body);

      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const [existing] = await db
        .select()
        .from(propertyFinancialTerms)
        .where(eq(propertyFinancialTerms.propertyId, property.id))
        .limit(1);
      const values = {
        ...input,
        orgId: auth.orgId,
        propertyId: property.id,
        updatedAt: new Date(),
      };
      if (existing) {
        await db
          .update(propertyFinancialTerms)
          .set(values as never)
          .where(eq(propertyFinancialTerms.id, existing.id));
      } else {
        await db.insert(propertyFinancialTerms).values(values as never);
      }

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPERTY_FINANCIAL_TERMS_UPDATED,
        entityType: 'PROPERTY',
        entityId: property.id,
      });
      await enqueueUpdatesForProperty(db, auth.orgId, property.id);

      const loaded = await loadProperty(db, auth.orgId, property.id);
      if (!loaded) {
        throw new Error('property not found after terms update');
      }
      return { property: toPropertyDto(loaded) };
    },
  );

  app.post(
    '/properties/:id/owners',
    { onRequest: [requirePermission('property:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = addOwnerRequestSchema.parse(request.body);

      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const [party] = await db
        .select()
        .from(parties)
        .where(and(eq(parties.id, input.partyId), eq(parties.orgId, auth.orgId)))
        .limit(1);
      if (!party) {
        throw new DomainError('NOT_FOUND', 'Parte não encontrada');
      }
      const [existing] = await db
        .select()
        .from(propertyOwners)
        .where(
          and(
            eq(propertyOwners.propertyId, property.id),
            eq(propertyOwners.partyId, input.partyId),
          ),
        )
        .limit(1);
      if (existing) {
        throw new DomainError('CONFLICT', 'Proprietário já vinculado');
      }
      await db.insert(propertyOwners).values({
        orgId: auth.orgId,
        propertyId: property.id,
        partyId: input.partyId,
        ownershipSharePct: input.ownershipSharePct ?? null,
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPERTY_OWNER_ADDED,
        entityType: 'PROPERTY',
        entityId: property.id,
        payload: { partyId: input.partyId },
      });

      const loaded = await loadProperty(db, auth.orgId, property.id);
      if (!loaded) {
        throw new Error('property not found after owner add');
      }
      return reply.status(201).send({ property: toPropertyDto(loaded) });
    },
  );

  app.delete(
    '/properties/:id/owners/:partyId',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, partyId } = z
        .object({ id: uuidSchema, partyId: uuidSchema })
        .parse(request.params);
      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const [owner] = await db
        .select()
        .from(propertyOwners)
        .where(and(eq(propertyOwners.propertyId, property.id), eq(propertyOwners.partyId, partyId)))
        .limit(1);
      if (owner) {
        await db.delete(propertyOwners).where(eq(propertyOwners.id, owner.id));
        await writeAudit(db, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PROPERTY_OWNER_REMOVED,
          entityType: 'PROPERTY',
          entityId: property.id,
          payload: { partyId },
        });
      }
      return { ok: true as const };
    },
  );

  app.post(
    '/properties/:id/features',
    { onRequest: [requirePermission('property:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = addFeatureRequestSchema.parse(request.body);

      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const [existing] = await db
        .select()
        .from(propertyFeatures)
        .where(
          and(
            eq(propertyFeatures.propertyId, property.id),
            eq(propertyFeatures.feature, input.feature),
          ),
        )
        .limit(1);
      if (!existing) {
        await db
          .insert(propertyFeatures)
          .values({ orgId: auth.orgId, propertyId: property.id, feature: input.feature });
      }

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPERTY_FEATURE_ADDED,
        entityType: 'PROPERTY',
        entityId: property.id,
        payload: { feature: input.feature },
      });

      const loaded = await loadProperty(db, auth.orgId, property.id);
      if (!loaded) {
        throw new Error('property not found after feature add');
      }
      return reply.status(201).send({ property: toPropertyDto(loaded) });
    },
  );

  app.delete(
    '/properties/:id/features/:feature',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, feature } = z
        .object({ id: uuidSchema, feature: z.string().min(1) })
        .parse(request.params);
      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const [existing] = await db
        .select()
        .from(propertyFeatures)
        .where(
          and(eq(propertyFeatures.propertyId, property.id), eq(propertyFeatures.feature, feature)),
        )
        .limit(1);
      if (existing) {
        await db.delete(propertyFeatures).where(eq(propertyFeatures.id, existing.id));
        await writeAudit(db, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PROPERTY_FEATURE_REMOVED,
          entityType: 'PROPERTY',
          entityId: property.id,
          payload: { feature },
        });
      }
      return { ok: true as const };
    },
  );

  app.post(
    '/properties/:id/media/upload-url',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = requestUploadUrlRequestSchema.parse(request.body);

      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      assertSizeAllowed(input.kind, input.sizeBytes);
      const key = buildStorageKey(auth.orgId, property.id, input.kind, input.mimeType);
      const { url, expiresIn } = await app.storage.getPresignedPutUrl({
        key,
        contentType: input.mimeType,
      });
      return { url, key, expiresIn };
    },
  );

  app.post(
    '/properties/:id/media/confirm',
    { onRequest: [requirePermission('property:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = confirmMediaRequestSchema.parse(request.body);

      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      // key gerada pelo servidor: prefixo obrigatório da org/property
      if (!input.key.startsWith(`orgs/${auth.orgId}/properties/${property.id}/`)) {
        throw new DomainError('INVALID_INPUT', 'Chave de storage inválida');
      }
      const kind = inferKindFromKey(input.key);
      const head = await app.storage.headObject(input.key);
      if (!head) {
        throw new DomainError('INVALID_INPUT', 'Objeto não encontrado no storage');
      }
      // Revalida o tamanho REAL do objeto (presigned PUT não limita o upload).
      assertSizeAllowed(kind, head.size);

      // Idempotência: mesma storageKey já confirmada → retorna a mídia existente.
      const [existing] = await db
        .select()
        .from(propertyMedia)
        .where(eq(propertyMedia.storageKey, input.key))
        .limit(1);
      if (existing) {
        return reply.status(200).send({
          media: propertyMediaSchema.parse({
            id: existing.id,
            kind: existing.kind,
            mimeType: existing.mimeType,
            sizeBytes: existing.sizeBytes,
            isPublic: existing.isPublic,
            createdAt: existing.createdAt.toISOString(),
          }),
        });
      }

      const media = first(
        await db
          .insert(propertyMedia)
          .values({
            orgId: auth.orgId,
            propertyId: property.id,
            kind,
            storageKey: input.key,
            mimeType: null,
            sizeBytes: head.size,
            isPublic: isPublicMediaKind(kind),
          })
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPERTY_MEDIA_CONFIRMED,
        entityType: 'PROPERTY',
        entityId: property.id,
        payload: { mediaId: media.id, sizeBytes: head.size },
      });
      await enqueueUpdatesForProperty(db, auth.orgId, property.id);

      return reply.status(201).send({
        media: propertyMediaSchema.parse({
          id: media.id,
          kind: media.kind,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          isPublic: media.isPublic,
          createdAt: media.createdAt.toISOString(),
        }),
      });
    },
  );

  app.delete(
    '/properties/:id/media/:mediaId',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, mediaId } = z
        .object({ id: uuidSchema, mediaId: uuidSchema })
        .parse(request.params);
      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const [media] = await db
        .select()
        .from(propertyMedia)
        .where(and(eq(propertyMedia.propertyId, property.id), eq(propertyMedia.id, mediaId)))
        .limit(1);
      if (media) {
        await db.delete(propertyMedia).where(eq(propertyMedia.id, media.id));
        if (app.storage) {
          await app.storage.deleteObject(media.storageKey).catch(() => undefined);
        }
        await writeAudit(db, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PROPERTY_MEDIA_DELETED,
          entityType: 'PROPERTY',
          entityId: property.id,
          payload: { mediaId },
        });
      }
      return { ok: true as const };
    },
  );

  return Promise.resolve();
};

function inferKindFromKey(key: string): 'PHOTO' | 'DOCUMENT' | 'FLOORPLAN' {
  const segment = key.split('/')[4];
  if (segment === 'document') {
    return 'DOCUMENT';
  }
  if (segment === 'floorplan') {
    return 'FLOORPLAN';
  }
  if (segment === 'photo') {
    return 'PHOTO';
  }
  throw new DomainError('INVALID_INPUT', 'Chave de storage inválida');
}

function summaryOf(row: typeof properties.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    propertyType: row.propertyType,
    status: row.status,
    totalAreaSqm: row.totalAreaSqm,
    builtAreaSqm: row.builtAreaSqm,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    parkingSpots: row.parkingSpots,
    furnished: row.furnished,
    petsAllowed: row.petsAllowed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
