import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  channelConnections,
  leadPropertyInterests,
  leads,
  listings,
  organizations,
  parties,
  partyConsents,
  partyIdentities,
  properties,
  timelineEvents,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { AUDIT_ACTIONS, normalizeEmail, normalizePhone } from '@aluguei/domain';
import { grupoOlxLeadPayloadSchema, normalizeGrupoOlxLead } from '@aluguei/integrations';
import type { NormalizedGrupoOlxLead } from '@aluguei/integrations';
import { writeAudit } from '../plugins/audit.js';
import { GRUPO_OLX_CHANNEL } from './feed-data.js';

/** Provider da caixa de entrada (`webhook_inbox`) para os leads do Grupo OLX (ADR-108). */
export const GRUPO_OLX_LEAD_PROVIDER = 'GRUPO_OLX_LEAD';
/** Origem do lead no CRM: o canal é `PORTAL` (veio de um portal), a origem diz qual. */
export const GRUPO_OLX_LEAD_SOURCE = 'GRUPO_OLX';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LeadRouting =
  | { ok: true; orgId: string; listingId: string | null; propertyId: string | null }
  | { ok: false; status: 400 | 404 | 422; code: string; message: string };

async function connectionByRef(db: AppDb, ref: string) {
  const [row] = await db
    .select({ orgId: channelConnections.orgId })
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.leadsEndpointRef, ref),
        eq(channelConnections.channel, GRUPO_OLX_CHANNEL),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A qual imobiliária o lead pertence. O payload não traz o anunciante: o lead de anúncio se acha
 * pelo `clientListingId` (o id do anúncio que o feed mandou); o MCMV, sem anúncio, pela URL por
 * imobiliária (se o Grupo OLX homologar esse formato) ou pelo CPF/CNPJ do anunciante.
 *
 * Respostas fora de 2xx fazem o Grupo OLX tentar de novo e guardar o lead por 14 dias para
 * revisão — por isso o lead de anúncio sem `clientListingId` recebe 4xx, como a documentação pede,
 * e o MCMV nunca recebe 4xx só por não ter anúncio.
 */
export async function routeGrupoOlxLead(
  db: AppDb,
  lead: NormalizedGrupoOlxLead,
  ref: string | null,
): Promise<LeadRouting> {
  const viaRef = ref !== null ? await connectionByRef(db, ref) : null;
  if (ref !== null && viaRef === null) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Endpoint desconhecido' };
  }

  if (lead.kind === 'MCMV') {
    if (viaRef) {
      return { ok: true, orgId: viaRef.orgId, listingId: null, propertyId: null };
    }
    if (lead.sellerDocument) {
      const candidates = await db
        .select({ orgId: organizations.id })
        .from(organizations)
        .innerJoin(
          channelConnections,
          and(
            eq(channelConnections.orgId, organizations.id),
            eq(channelConnections.channel, GRUPO_OLX_CHANNEL),
            eq(channelConnections.enabled, true),
          ),
        )
        .where(
          and(eq(organizations.document, lead.sellerDocument), eq(organizations.status, 'ACTIVE')),
        )
        .limit(2);
      if (candidates.length === 1 && candidates[0]) {
        return { ok: true, orgId: candidates[0].orgId, listingId: null, propertyId: null };
      }
    }
    return {
      ok: false,
      status: 422,
      code: 'ADVERTISER_NOT_FOUND',
      message: 'Anunciante do lead MCMV não identificado',
    };
  }

  if (lead.clientListingId === null) {
    return {
      ok: false,
      status: 400,
      code: 'CLIENT_LISTING_ID_MISSING',
      message: 'Lead de anúncio sem clientListingId',
    };
  }
  const [listing] = UUID.test(lead.clientListingId)
    ? await db
        .select({ id: listings.id, orgId: listings.orgId, propertyId: listings.propertyId })
        .from(listings)
        .where(eq(listings.id, lead.clientListingId))
        .limit(1)
    : [];
  if (listing) {
    if (viaRef && viaRef.orgId !== listing.orgId) {
      return {
        ok: false,
        status: 422,
        code: 'LISTING_ORG_MISMATCH',
        message: 'O anúncio não pertence à imobiliária deste endpoint',
      };
    }
    return {
      ok: true,
      orgId: listing.orgId,
      listingId: listing.id,
      propertyId: listing.propertyId,
    };
  }
  if (viaRef) {
    // Anúncio que não é nosso (ex.: de um software anterior), mas a URL diz de quem é o lead.
    return { ok: true, orgId: viaRef.orgId, listingId: null, propertyId: null };
  }
  return {
    ok: false,
    status: 422,
    code: 'LISTING_NOT_FOUND',
    message: 'Anúncio do lead não encontrado',
  };
}

/** Entrega repetida (mesmo `originLeadId`): conta para a tela, não cria nada. */
export async function countDuplicateLeadDelivery(db: AppDb, orgId: string): Promise<void> {
  await db
    .update(channelConnections)
    .set({ leadDuplicateDeliveries: sql`${channelConnections.leadDuplicateDeliveries} + 1` })
    .where(
      and(eq(channelConnections.orgId, orgId), eq(channelConnections.channel, GRUPO_OLX_CHANNEL)),
    );
}

export interface GrupoOlxLeadInboxPayload {
  lead: unknown;
  listingId: string | null;
  propertyId: string | null;
}

/**
 * Processa um lead da caixa de entrada (worker): pessoa (deduplicada por e-mail e telefone),
 * consentimento de importação, lead no funil e interesse no imóvel. Sem dado pessoal na timeline
 * nem na auditoria. Mesmo `originLeadId` não vira dois leads, nem se o job rodar duas vezes.
 */
export async function processGrupoOlxLead(
  db: AppDb,
  orgId: string,
  payload: GrupoOlxLeadInboxPayload,
): Promise<{ created: boolean }> {
  const lead = normalizeGrupoOlxLead(grupoOlxLeadPayloadSchema.parse(payload.lead));
  const created = await db.transaction(async (tx) => {
    const already = await tx.execute(sql`
      select 1 from timeline_events
      where org_id = ${orgId} and entity_type = 'LEAD' and event_type = 'LEAD_CREATED'
        and payload->>'originLeadId' = ${lead.originLeadId}
      limit 1
    `);
    if (already.rows.length > 0) {
      return false;
    }

    const identities: Array<{ kind: 'EMAIL' | 'PHONE'; value: string }> = [];
    if (lead.email) identities.push({ kind: 'EMAIL', value: normalizeEmail(lead.email) });
    if (lead.phone) identities.push({ kind: 'PHONE', value: normalizePhone(lead.phone) });

    let partyId: string | null = null;
    for (const identity of identities) {
      const [found] = await tx
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
      if (found) {
        partyId = found.partyId;
        break;
      }
    }
    if (partyId === null) {
      const [party] = await tx
        .insert(parties)
        .values({ orgId, type: 'PERSON', name: lead.name ?? 'Contato do Grupo OLX' })
        .returning({ id: parties.id });
      if (!party) throw new Error('pessoa do lead do Grupo OLX não criada');
      partyId = party.id;
      for (const identity of identities) {
        await tx
          .insert(partyIdentities)
          .values({ orgId, partyId, kind: identity.kind, value: identity.value })
          .onConflictDoNothing();
      }
    }

    // LGPD: o contato chegou por um canal de terceiro; o consentimento registra a importação.
    const [consent] = await tx
      .select({ id: partyConsents.id })
      .from(partyConsents)
      .where(
        and(
          eq(partyConsents.orgId, orgId),
          eq(partyConsents.partyId, partyId),
          eq(partyConsents.purpose, 'LEAD_IMPORT'),
          isNull(partyConsents.revokedAt),
        ),
      )
      .limit(1);
    if (!consent) {
      const received = lead.receivedAt ? new Date(lead.receivedAt) : new Date();
      await tx.insert(partyConsents).values({
        orgId,
        partyId,
        purpose: 'LEAD_IMPORT',
        grantedAt: Number.isNaN(received.getTime()) ? new Date() : received,
      });
    }

    let purpose: 'RENT' | 'SALE' = lead.purpose ?? 'RENT';
    if (lead.purpose === null && payload.propertyId) {
      const [property] = await tx
        .select({ purpose: properties.purpose })
        .from(properties)
        .where(and(eq(properties.id, payload.propertyId), eq(properties.orgId, orgId)))
        .limit(1);
      if (property?.purpose === 'SALE') purpose = 'SALE';
    }

    const [created] = await tx
      .insert(leads)
      .values({
        orgId,
        status: 'NEW',
        purpose,
        source: GRUPO_OLX_LEAD_SOURCE,
        channel: 'PORTAL',
        partyId,
        notes: lead.message,
      })
      .returning({ id: leads.id });
    if (!created) throw new Error('lead do Grupo OLX não criado');
    if (payload.propertyId) {
      await tx
        .insert(leadPropertyInterests)
        .values({ orgId, leadId: created.id, propertyId: payload.propertyId })
        .onConflictDoNothing();
    }
    const trail = {
      source: GRUPO_OLX_LEAD_SOURCE,
      originLeadId: lead.originLeadId,
      kind: lead.kind,
      leadType: lead.leadType,
      temperature: lead.temperature,
      leadCerto: lead.leadCerto,
      originListingId: lead.originListingId,
      listingId: payload.listingId,
    };
    await tx.insert(timelineEvents).values({
      orgId,
      entityType: 'LEAD',
      entityId: created.id,
      eventType: 'LEAD_CREATED',
      payload: trail,
    });
    await writeAudit(tx, {
      orgId,
      actorUserId: null,
      action: AUDIT_ACTIONS.LEAD_CREATED,
      entityType: 'LEAD',
      entityId: created.id,
      payload: trail,
    });
    return true;
  });
  await db
    .update(channelConnections)
    .set({ lastLeadAt: new Date() })
    .where(
      and(eq(channelConnections.orgId, orgId), eq(channelConnections.channel, GRUPO_OLX_CHANNEL)),
    );
  return { created };
}
