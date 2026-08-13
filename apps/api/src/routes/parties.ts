import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { partyAddresses, partyIdentities, partyRoles, parties } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  findDedupeMatches,
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
} from '@aluguei/domain';
import type { IdentityKind } from '@aluguei/domain';
import {
  createPartyRequestSchema,
  createPartyResponseSchema,
  dedupePartyRequestSchema,
  dedupePartyResponseSchema,
  listPartiesQuerySchema,
  listPartiesResponseSchema,
  partySchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

function normalizeIdentityValue(kind: string, value: string): string {
  switch (kind) {
    case 'EMAIL':
      return normalizeEmail(value);
    case 'PHONE':
      return normalizePhone(value);
    case 'CPF':
    case 'CNPJ':
      return normalizeDocument(value);
    default:
      return value.trim();
  }
}

interface LoadedParty {
  id: string;
  orgId: string;
  type: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  identities: Array<{ kind: string; value: string }>;
  addresses: Array<Record<string, unknown>>;
}

async function loadParty(db: AppDb, orgId: string, partyId: string): Promise<LoadedParty | null> {
  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.orgId, orgId)))
    .limit(1);
  if (!party) {
    return null;
  }
  const identities = await db
    .select({ kind: partyIdentities.kind, value: partyIdentities.value })
    .from(partyIdentities)
    .where(eq(partyIdentities.partyId, partyId));
  const addresses = await db
    .select()
    .from(partyAddresses)
    .where(eq(partyAddresses.partyId, partyId));
  return { ...party, identities, addresses };
}

/** Converte null do DB para ausência (zod .optional() rejeita null). */
function toAddressDto(address: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(address)) {
    if (value !== null) {
      result[key] = value;
    }
  }
  return result;
}

function toPartyDto(loaded: LoadedParty): unknown {
  return partySchema.parse({
    id: loaded.id,
    orgId: loaded.orgId,
    type: loaded.type,
    name: loaded.name,
    status: loaded.status,
    identities: loaded.identities.map((i) => ({ kind: i.kind, value: i.value })),
    addresses: loaded.addresses.map((a) => toAddressDto(a)),
    createdAt: loaded.createdAt.toISOString(),
    updatedAt: loaded.updatedAt.toISOString(),
  });
}

export const partyRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/parties',
    { onRequest: [requirePermission('party:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createPartyRequestSchema.parse(request.body);

      const normalized = input.identities.map((i) => ({
        kind: i.kind,
        value: normalizeIdentityValue(i.kind, i.value),
      }));

      // Deduplicação na criação: identidade única por (org, kind, value).
      const existingIdentities =
        normalized.length > 0
          ? await db
              .select()
              .from(partyIdentities)
              .where(
                and(
                  eq(partyIdentities.orgId, auth.orgId),
                  inArray(
                    partyIdentities.value,
                    normalized.map((n) => n.value),
                  ),
                ),
              )
          : [];
      // Casa apenas por pares (kind, value) — evita falso positivo entre kinds.
      const matched = existingIdentities.find((entry) =>
        normalized.some((n) => n.kind === entry.kind && n.value === entry.value),
      );
      if (matched) {
        const existing = await loadParty(db, auth.orgId, matched.partyId);
        if (existing) {
          return reply.status(200).send(
            createPartyResponseSchema.parse({
              party: toPartyDto(existing),
              duplicate: true,
              matchedPartyId: existing.id,
            }),
          );
        }
      }

      const party = first(
        await db
          .insert(parties)
          .values({ orgId: auth.orgId, type: input.type, name: input.name })
          .returning(),
      );

      if (normalized.length > 0) {
        await db.insert(partyIdentities).values(
          normalized.map((n) => ({
            orgId: auth.orgId,
            partyId: party.id,
            kind: n.kind,
            value: n.value,
          })),
        );
      }
      if (input.roles && input.roles.length > 0) {
        await db
          .insert(partyRoles)
          .values(input.roles.map((role) => ({ orgId: auth.orgId, partyId: party.id, role })));
      }
      if (input.addresses && input.addresses.length > 0) {
        await db.insert(partyAddresses).values(
          input.addresses.map((a) => ({
            ...toAddressDto(a),
            orgId: auth.orgId,
            partyId: party.id,
          })),
        );
      }

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PARTY_CREATED,
        entityType: 'PARTY',
        entityId: party.id,
        payload: { identities: normalized.map((n) => n.kind) },
      });

      const created = await loadParty(db, auth.orgId, party.id);
      if (!created) {
        throw new Error('party not found after insert');
      }
      return reply.status(201).send(
        createPartyResponseSchema.parse({
          party: toPartyDto(created),
          duplicate: false,
          matchedPartyId: null,
        }),
      );
    },
  );

  app.get('/parties', { onRequest: [requirePermission('party:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listPartiesQuerySchema.parse(request.query);
    const rows = await db
      .select()
      .from(parties)
      .where(eq(parties.orgId, auth.orgId))
      .orderBy(desc(parties.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const dto = [];
    for (const row of rows) {
      const loaded = await loadParty(db, auth.orgId, row.id);
      if (loaded) {
        dto.push(toPartyDto(loaded));
      }
    }

    return listPartiesResponseSchema.parse({ parties: dto, total: dto.length });
  });

  app.post(
    '/parties/dedupe',
    { onRequest: [requirePermission('party:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const input = dedupePartyRequestSchema.parse(request.body);
      const normalized = input.identities.map((i) => ({
        kind: i.kind,
        value: normalizeIdentityValue(i.kind, i.value),
      }));

      const existing =
        normalized.length > 0
          ? await db
              .select()
              .from(partyIdentities)
              .where(
                and(
                  eq(partyIdentities.orgId, auth.orgId),
                  inArray(
                    partyIdentities.value,
                    normalized.map((n) => n.value),
                  ),
                ),
              )
          : [];
      const partyIds = [...new Set(existing.map((e) => e.partyId))];
      const partyRows =
        partyIds.length > 0
          ? await db.select().from(parties).where(inArray(parties.id, partyIds))
          : [];
      const partyName = new Map(partyRows.map((p) => [p.id, p.name]));

      const matches = findDedupeMatches(
        normalized,
        existing.map((e) => ({
          partyId: e.partyId,
          partyName: partyName.get(e.partyId) ?? '?',
          kind: e.kind as IdentityKind,
          value: e.value,
        })),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PARTY_DEDUPE,
        entityType: 'PARTY',
        entityId: 'bulk',
        payload: { matchCount: matches.length },
      });

      return dedupePartyResponseSchema.parse({ matches });
    },
  );
  return Promise.resolve();
};
