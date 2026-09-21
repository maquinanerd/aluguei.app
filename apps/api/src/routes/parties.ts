import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  partyAddresses,
  partyConsents,
  partyDocuments,
  partyIdentities,
  partyRoles,
  parties,
} from '@aluguei/db';
import type { AppDb, DbExecutor } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  assertValidIdentityValue,
  findDedupeMatches,
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
} from '@aluguei/domain';
import type { IdentityKind } from '@aluguei/domain';
import {
  uuidSchema,
  confirmPartyDocumentRequestSchema,
  confirmPartyDocumentResponseSchema,
  createPartyRequestSchema,
  createPartyResponseSchema,
  dedupePartyRequestSchema,
  dedupePartyResponseSchema,
  deletePartyDocumentResponseSchema,
  getPartyResponseSchema,
  listPartiesQuerySchema,
  listPartiesResponseSchema,
  listPartyDocumentsResponseSchema,
  partySchema,
  requestPartyDocumentUrlRequestSchema,
  requestPartyDocumentUrlResponseSchema,
  updatePartyRequestSchema,
  updatePartyResponseSchema,
} from '@aluguei/contracts';
import type { PartyDocumentKind } from '@aluguei/contracts';
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

/**
 * Identidades normalizadas e validadas: CPF e CNPJ passam pelo dígito verificador do domínio
 * (auditoria 2026-09-10, P2-01 — `12345678900` era aceito). Duplicata no próprio corpo é recusada.
 */
function normalizeIdentities(
  input: readonly { kind: IdentityKind; value: string }[],
): Array<{ kind: IdentityKind; value: string }> {
  const normalized = input.map((identity) => {
    assertValidIdentityValue(identity.kind, identity.value);
    return { kind: identity.kind, value: normalizeIdentityValue(identity.kind, identity.value) };
  });
  const seen = new Set<string>();
  for (const identity of normalized) {
    const key = `${identity.kind}:${identity.value}`;
    if (seen.has(key)) {
      throw new DomainError('INVALID_INPUT', 'Identidade repetida no mesmo cadastro', {
        kind: identity.kind,
      });
    }
    seen.add(key);
  }
  return normalized;
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

async function loadParty(
  db: DbExecutor,
  orgId: string,
  partyId: string,
): Promise<LoadedParty | null> {
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
    .where(eq(partyIdentities.partyId, partyId))
    .orderBy(asc(partyIdentities.kind));
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
      // Normalização de boundary: Date → ISO 8601 (ver toDtoValue em properties.ts).
      result[key] = value instanceof Date ? value.toISOString() : value;
    }
  }
  return result;
}

/** Só os campos que o endereço aceita — `id`, `orgId` e `partyId` vêm do servidor. */
const ADDRESS_FIELDS = [
  'label',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'zipCode',
  'country',
  'isPublic',
] as const;

function toAddressValues(address: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of ADDRESS_FIELDS) {
    if (address[field] !== undefined) {
      values[field] = address[field];
    }
  }
  return values;
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

function toDocumentDto(row: typeof partyDocuments.$inferSelect): unknown {
  return {
    id: row.id,
    kind: row.kind,
    documentKey: row.documentKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `%`, `_` e `\` do texto de busca viram literais no ILIKE. */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Busca de pessoa por trecho do nome, do e-mail ou dos dígitos de CPF, CNPJ ou telefone
 * (identidades já normalizadas) — combobox da candidatura (P1-17).
 */
function partySearch(orgId: string, text: string): SQL | undefined {
  const pattern = `%${escapeLikePattern(text)}%`;
  const matches: SQL[] = [
    ilike(parties.name, pattern),
    sql`exists (select 1 from ${partyIdentities} pi
      where pi.party_id = ${parties.id} and pi.org_id = ${orgId} and pi.value ilike ${pattern})`,
  ];
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 3) {
    matches.push(sql`exists (select 1 from ${partyIdentities} pi
      where pi.party_id = ${parties.id} and pi.org_id = ${orgId}
        and pi.kind in ('CPF', 'CNPJ', 'PHONE') and pi.value like ${`%${digits}%`})`);
  }
  return or(...matches);
}

/** Detalhe completo da pessoa (P2-01): papéis, consentimentos e documentos. */
async function partyDetail(db: DbExecutor, orgId: string, partyId: string): Promise<unknown> {
  const loaded = await loadParty(db, orgId, partyId);
  if (!loaded) {
    throw new DomainError('NOT_FOUND', 'Pessoa não encontrada');
  }
  const roles = await db
    .select({ role: partyRoles.role })
    .from(partyRoles)
    .where(eq(partyRoles.partyId, partyId))
    .orderBy(asc(partyRoles.role));
  const consents = await db
    .select()
    .from(partyConsents)
    .where(eq(partyConsents.partyId, partyId))
    .orderBy(desc(partyConsents.grantedAt));
  const documents = await db
    .select()
    .from(partyDocuments)
    .where(eq(partyDocuments.partyId, partyId))
    .orderBy(desc(partyDocuments.createdAt));
  return getPartyResponseSchema.parse({
    party: toPartyDto(loaded),
    roles: roles.map((row) => row.role),
    consents: consents.map((row) => ({
      id: row.id,
      purpose: row.purpose,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    })),
    documents: documents.map((row) => toDocumentDto(row)),
  });
}

const DOCUMENT_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Documento de pessoa: 20MB, como DOCUMENT em property_media. */
const DOCUMENT_SIZE_LIMIT = 20 * 1024 * 1024;

function assertDocumentSize(sizeBytes: number): void {
  if (sizeBytes > DOCUMENT_SIZE_LIMIT) {
    throw new DomainError(
      'INVALID_INPUT',
      `Arquivo excede o limite de ${String(Math.round(DOCUMENT_SIZE_LIMIT / (1024 * 1024)))}MB`,
    );
  }
}

/** Chave sempre gerada pelo servidor, com prefixo da org e da pessoa. */
function buildPartyDocumentKey(
  orgId: string,
  partyId: string,
  kind: PartyDocumentKind,
  mimeType: string,
): string {
  const ext = DOCUMENT_EXT_BY_MIME[mimeType] ?? 'bin';
  return `orgs/${orgId}/parties/${partyId}/${kind.toLowerCase()}/${randomUUID()}.${ext}`;
}

/** Tipo do objeto a partir da extensão da chave — a chave foi gerada pelo servidor. */
function mimeFromKey(key: string): string | null {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  for (const [mime, mapped] of Object.entries(DOCUMENT_EXT_BY_MIME)) {
    if (mapped === ext) {
      return mime;
    }
  }
  return null;
}

/** Pessoa da própria organização — id de outra org responde 404 uniforme (ADR-044). */
async function assertPartyInOrg(db: DbExecutor, orgId: string, partyId: string): Promise<void> {
  const [party] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.orgId, orgId)))
    .limit(1);
  if (!party) {
    throw new DomainError('NOT_FOUND', 'Pessoa não encontrada');
  }
}

/** Pessoa da própria organização, com trava de linha para a edição concorrente. */
async function lockParty(
  tx: DbExecutor,
  orgId: string,
  partyId: string,
): Promise<typeof parties.$inferSelect> {
  const [party] = await tx
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.orgId, orgId)))
    .for('update');
  if (!party) {
    throw new DomainError('NOT_FOUND', 'Pessoa não encontrada');
  }
  return party;
}

/** Identidade que já é de outra pessoa da org → 409 (UNIQUE não vira 500 — P2-09). */
async function assertIdentitiesFree(
  tx: DbExecutor,
  orgId: string,
  partyId: string,
  normalized: readonly { kind: IdentityKind; value: string }[],
): Promise<void> {
  if (normalized.length === 0) {
    return;
  }
  const rows = await tx
    .select({ kind: partyIdentities.kind, value: partyIdentities.value })
    .from(partyIdentities)
    .where(
      and(
        eq(partyIdentities.orgId, orgId),
        ne(partyIdentities.partyId, partyId),
        inArray(
          partyIdentities.value,
          normalized.map((n) => n.value),
        ),
      ),
    );
  const conflict = rows.find((row) =>
    normalized.some((n) => n.kind === row.kind && n.value === row.value),
  );
  if (conflict) {
    throw new DomainError('CONFLICT', 'Identidade já usada por outra pessoa', {
      kind: conflict.kind,
    });
  }
}

export const partyRoutes: FastifyPluginAsync = (app) => {
  const db: AppDb = app.db;

  app.post(
    '/parties',
    { onRequest: [requirePermission('party:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createPartyRequestSchema.parse(request.body);

      const normalized = normalizeIdentities(input.identities);

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
            ...toAddressValues(a),
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
      .where(
        and(
          eq(parties.orgId, auth.orgId),
          query.ids ? inArray(parties.id, query.ids) : undefined,
          query.q ? partySearch(auth.orgId, query.q) : undefined,
          // Sem filtro explícito, a lista mostra só as ativas; `ids` resolve qualquer uma
          // (linhas de outra página podem apontar para pessoa arquivada).
          query.status
            ? eq(parties.status, query.status)
            : query.ids
              ? undefined
              : eq(parties.status, 'ACTIVE'),
        ),
      )
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

  /** Detalhe da pessoa (P2-01). Pessoa de outra organização → 404 uniforme (ADR-044). */
  app.get('/parties/:id', { onRequest: [requirePermission('party:read')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    return await partyDetail(db, auth.orgId, id);
  });

  /**
   * Edição da pessoa (P2-01): nome, tipo, status, identidades, papéis e endereços. Cada lista
   * enviada substitui a atual. Auditoria com o diff dos campos simples e o que mudou nas listas.
   */
  app.patch('/parties/:id', { onRequest: [requirePermission('party:write')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const input = updatePartyRequestSchema.parse(request.body);
    const normalized = input.identities ? normalizeIdentities(input.identities) : null;

    await db.transaction(async (tx) => {
      const party = await lockParty(tx, auth.orgId, id);
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const next: Partial<typeof parties.$inferInsert> = {};
      for (const field of ['name', 'type', 'status'] as const) {
        const value = input[field];
        if (value !== undefined && value !== party[field]) {
          changes[field] = { from: party[field], to: value };
          next[field] = value;
        }
      }

      if (normalized) {
        await assertIdentitiesFree(tx, auth.orgId, party.id, normalized);
        const current = await tx
          .select({ kind: partyIdentities.kind, value: partyIdentities.value })
          .from(partyIdentities)
          .where(eq(partyIdentities.partyId, party.id));
        const before = current.map((row) => `${row.kind}:${row.value}`).sort();
        const after = normalized.map((row) => `${row.kind}:${row.value}`).sort();
        if (before.join('|') !== after.join('|')) {
          // O diff guarda só o tipo da identidade — o valor é dado pessoal (P2-11).
          changes['identities'] = {
            from: current.map((row) => row.kind).sort(),
            to: normalized.map((row) => row.kind).sort(),
          };
          await tx.delete(partyIdentities).where(eq(partyIdentities.partyId, party.id));
          await tx.insert(partyIdentities).values(
            normalized.map((n) => ({
              orgId: auth.orgId,
              partyId: party.id,
              kind: n.kind,
              value: n.value,
            })),
          );
        }
      }

      if (input.roles) {
        const current = await tx
          .select({ role: partyRoles.role })
          .from(partyRoles)
          .where(eq(partyRoles.partyId, party.id));
        const before = current.map((row) => row.role).sort();
        const after = [...new Set(input.roles)].sort();
        if (before.join('|') !== after.join('|')) {
          changes['roles'] = { from: before, to: after };
          await tx.delete(partyRoles).where(eq(partyRoles.partyId, party.id));
          if (after.length > 0) {
            await tx
              .insert(partyRoles)
              .values(after.map((role) => ({ orgId: auth.orgId, partyId: party.id, role })));
          }
        }
      }

      if (input.addresses) {
        const current = await tx
          .select({ id: partyAddresses.id })
          .from(partyAddresses)
          .where(eq(partyAddresses.partyId, party.id));
        changes['addresses'] = { from: current.length, to: input.addresses.length };
        await tx.delete(partyAddresses).where(eq(partyAddresses.partyId, party.id));
        if (input.addresses.length > 0) {
          await tx.insert(partyAddresses).values(
            input.addresses.map((a) => ({
              ...toAddressValues(a),
              orgId: auth.orgId,
              partyId: party.id,
            })),
          );
        }
      }

      if (Object.keys(changes).length === 0) {
        return;
      }
      await tx
        .update(parties)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(parties.id, party.id));

      const statusChange = changes['status'];
      const action =
        statusChange?.to === 'ARCHIVED'
          ? AUDIT_ACTIONS.PARTY_ARCHIVED
          : statusChange?.to === 'ACTIVE'
            ? AUDIT_ACTIONS.PARTY_REACTIVATED
            : AUDIT_ACTIONS.PARTY_UPDATED;
      await writeAudit(tx, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action,
        entityType: 'PARTY',
        entityId: party.id,
        payload: { changes },
      });
    });

    return updatePartyResponseSchema.parse(await partyDetail(db, auth.orgId, id));
  });

  app.post(
    '/parties/dedupe',
    { onRequest: [requirePermission('party:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const input = dedupePartyRequestSchema.parse(request.body);
      // A deduplicação aceita valor mal formado: ela serve para procurar, não para cadastrar.
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

  app.get(
    '/parties/:id/documents',
    { onRequest: [requirePermission('party:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      await assertPartyInOrg(db, auth.orgId, id);
      const rows = await db
        .select()
        .from(partyDocuments)
        .where(eq(partyDocuments.partyId, id))
        .orderBy(desc(partyDocuments.createdAt));
      return listPartyDocumentsResponseSchema.parse({
        documents: rows.map((row) => toDocumentDto(row)),
      });
    },
  );

  /** URL de upload do documento da pessoa (P2-01: `party_documents` estava órfã). */
  app.post(
    '/parties/:id/documents/upload-url',
    {
      onRequest: [requirePermission('party:write')],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = requestPartyDocumentUrlRequestSchema.parse(request.body);
      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      await assertPartyInOrg(db, auth.orgId, id);
      assertDocumentSize(input.sizeBytes);
      const key = buildPartyDocumentKey(auth.orgId, id, input.kind, input.mimeType);
      const { url, expiresIn } = await app.storage.getPresignedPutUrl({
        key,
        contentType: input.mimeType,
      });
      return requestPartyDocumentUrlResponseSchema.parse({ url, key, expiresIn });
    },
  );

  app.post(
    '/parties/:id/documents/confirm',
    {
      onRequest: [requirePermission('party:write')],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = confirmPartyDocumentRequestSchema.parse(request.body);
      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      await assertPartyInOrg(db, auth.orgId, id);
      // Chave gerada pelo servidor: prefixo obrigatório da org e da pessoa.
      if (!input.key.startsWith(`orgs/${auth.orgId}/parties/${id}/`)) {
        throw new DomainError('INVALID_INPUT', 'Chave de storage inválida');
      }
      const head = await app.storage.headObject(input.key);
      if (!head) {
        throw new DomainError('INVALID_INPUT', 'Objeto não encontrado no storage');
      }
      // Revalida o tamanho REAL do objeto (presigned PUT não limita o upload).
      assertDocumentSize(head.size);

      // Idempotência: a mesma chave já confirmada devolve o documento existente.
      const [existing] = await db
        .select()
        .from(partyDocuments)
        .where(eq(partyDocuments.documentKey, input.key))
        .limit(1);
      if (existing) {
        return reply
          .status(200)
          .send(confirmPartyDocumentResponseSchema.parse({ document: toDocumentDto(existing) }));
      }

      const document = first(
        await db
          .insert(partyDocuments)
          .values({
            orgId: auth.orgId,
            partyId: id,
            kind: input.kind,
            documentKey: input.key,
            mimeType: mimeFromKey(input.key),
            sizeBytes: head.size,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PARTY_DOCUMENT_CONFIRMED,
        entityType: 'PARTY',
        entityId: id,
        payload: { documentId: document.id, kind: input.kind, sizeBytes: head.size },
      });
      return reply
        .status(201)
        .send(confirmPartyDocumentResponseSchema.parse({ document: toDocumentDto(document) }));
    },
  );

  app.delete(
    '/parties/:id/documents/:documentId',
    { onRequest: [requirePermission('party:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, documentId } = z
        .object({ id: uuidSchema, documentId: uuidSchema })
        .parse(request.params);
      await assertPartyInOrg(db, auth.orgId, id);
      const [document] = await db
        .select()
        .from(partyDocuments)
        .where(
          and(
            eq(partyDocuments.id, documentId),
            eq(partyDocuments.partyId, id),
            eq(partyDocuments.orgId, auth.orgId),
          ),
        )
        .limit(1);
      if (!document) {
        throw new DomainError('NOT_FOUND', 'Documento não encontrado');
      }
      await db.delete(partyDocuments).where(eq(partyDocuments.id, document.id));
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PARTY_DOCUMENT_DELETED,
        entityType: 'PARTY',
        entityId: id,
        payload: { documentId: document.id, kind: document.kind },
      });
      return deletePartyDocumentResponseSchema.parse({ ok: true });
    },
  );

  return Promise.resolve();
};
