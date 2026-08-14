import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  conversationIntents,
  conversations,
  leadPropertyInterests,
  leads,
  messages,
  parties,
  partyIdentities,
  properties,
  propertyAddresses,
  propertyFinancialTerms,
  timelineEvents,
  visits,
} from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  advanceLeadTo,
  codePrefixFor,
  formatCode,
  normalizePhone,
  parsePropertyCode,
} from '@aluguei/domain';
import type { FunnelStatus } from '@aluguei/domain';
import type { AiProvider, WebhookMessageEvent, WhatsAppMessenger } from '@aluguei/integrations';
import { writeAudit } from '../plugins/audit.js';
import {
  buildFallbackReply,
  buildHandoffReply,
  buildPropertyNotFoundReply,
  buildPropertyReply,
  buildVisitScheduleRequest,
} from './bot.js';

const HANDOFF_RE = /\b(atendente|humano|falar com algu[ée]m|suporte|pessoa)\b/i;

/** Garante `properties.code` (UNIQUE por org) — gera sob demanda com retry. */
export async function ensurePropertyCode(
  db: AppDb,
  orgId: string,
  propertyId: string,
): Promise<string> {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) {
    throw new DomainError('NOT_FOUND', 'Imóvel não encontrado');
  }
  if (property.code) {
    return property.code;
  }
  const prefix = codePrefixFor(property.propertyType);
  const rows = await db
    .select({ code: properties.code })
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.propertyType, property.propertyType)));
  const maxSeq = rows.reduce((max, row) => {
    const seq = row.code?.startsWith(prefix) ? Number(row.code.slice(prefix.length)) : 0;
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const candidate = formatCode(prefix, maxSeq + attempt);
    try {
      const [updated] = await db
        .update(properties)
        .set({ code: candidate, updatedAt: new Date() })
        .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
        .returning();
      if (updated?.code) {
        return updated.code;
      }
    } catch {
      // conflito UNIQUE (org, code) — tenta próximo
    }
  }
  throw new DomainError('CONFLICT', 'Não foi possível gerar código do imóvel');
}

async function findOrCreateParty(
  db: AppDb,
  orgId: string,
  phone: string,
  name: string | null,
): Promise<string> {
  const normalized = normalizePhone(phone);
  const [existing] = await db
    .select({ partyId: partyIdentities.partyId })
    .from(partyIdentities)
    .where(
      and(
        eq(partyIdentities.orgId, orgId),
        eq(partyIdentities.kind, 'PHONE'),
        eq(partyIdentities.value, normalized),
      ),
    )
    .limit(1);
  if (existing) {
    return existing.partyId;
  }
  const [party] = await db
    .insert(parties)
    .values({ orgId, type: 'PERSON', name: name ?? 'Contato WhatsApp' })
    .returning();
  if (!party) {
    throw new Error('party insert failed');
  }
  await db
    .insert(partyIdentities)
    .values({ orgId, partyId: party.id, kind: 'PHONE', value: normalized });
  return party.id;
}

async function findActiveConversation(
  db: AppDb,
  orgId: string,
  waContactId: string,
): Promise<typeof conversations.$inferSelect | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, orgId),
        eq(conversations.waContactId, waContactId),
        eq(conversations.channel, 'whatsapp'),
        inArray(conversations.status, ['OPEN', 'ACTIVE', 'NEEDS_HUMAN']),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  return conversation ?? null;
}

async function createLeadForConversation(
  db: AppDb,
  orgId: string,
  partyId: string,
  conversationId: string,
): Promise<string> {
  const [lead] = await db
    .insert(leads)
    .values({ orgId, partyId, source: 'WHATSAPP', channel: 'whatsapp', notes: null })
    .returning();
  if (!lead) {
    throw new Error('lead insert failed');
  }
  await db
    .update(conversations)
    .set({ leadId: lead.id, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  await db.insert(timelineEvents).values({
    orgId,
    entityType: 'LEAD',
    entityId: lead.id,
    eventType: 'LEAD_CREATED',
    payload: { channel: 'whatsapp' },
  });
  return lead.id;
}

interface ResolvedProperty {
  id: string;
  title: string;
  code: string;
  monthlyRentCents: number | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
}

async function resolvePropertyByCode(
  db: AppDb,
  orgId: string,
  code: string,
): Promise<ResolvedProperty | null> {
  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.code, code)))
    .limit(1);
  if (!property) {
    return null;
  }
  const [terms] = await db
    .select()
    .from(propertyFinancialTerms)
    .where(eq(propertyFinancialTerms.propertyId, property.id))
    .limit(1);
  const [address] = await db
    .select()
    .from(propertyAddresses)
    .where(and(eq(propertyAddresses.propertyId, property.id), eq(propertyAddresses.isPublic, true)))
    .limit(1);
  return {
    id: property.id,
    title: property.title,
    code: property.code ?? code,
    monthlyRentCents: terms?.monthlyRentCents ?? null,
    neighborhood: address?.neighborhood ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    parkingSpots: property.parkingSpots,
    furnished: property.furnished,
    petsAllowed: property.petsAllowed,
  };
}

async function advanceLeadStatus(
  db: AppDb,
  orgId: string,
  leadId: string,
  to: FunnelStatus,
): Promise<void> {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1);
  if (!lead) {
    return;
  }
  const current = lead.status as FunnelStatus;
  const next = advanceLeadTo(current, to);
  if (next !== current) {
    await db.update(leads).set({ status: next, updatedAt: new Date() }).where(eq(leads.id, leadId));
    await db.insert(timelineEvents).values({
      orgId,
      entityType: 'LEAD',
      entityId: leadId,
      eventType: 'LEAD_STATUS_CHANGED',
      payload: { from: current, to: next, source: 'whatsapp' },
    });
  }
}

async function persistMessage(
  db: AppDb,
  orgId: string,
  conversationId: string,
  input: {
    direction: 'INBOUND' | 'OUTBOUND';
    senderType: 'USER' | 'AGENT' | 'BOT';
    body: string;
    waMessageId?: string | null;
    replyToMessageId?: string | null;
  },
): Promise<typeof messages.$inferSelect | null> {
  const values = {
    orgId,
    conversationId,
    direction: input.direction,
    senderType: input.senderType,
    body: input.body,
    messageType: 'TEXT',
    waMessageId: input.waMessageId ?? null,
    replyToMessageId: input.replyToMessageId ?? null,
  };
  const [message] = await db.insert(messages).values(values).onConflictDoNothing().returning();
  return message ?? null;
}

/** Envia resposta do bot (idempotente: verifica reply_to_message_id antes de reenviar). */
export async function sendBotReply(
  db: AppDb,
  orgId: string,
  conversation: typeof conversations.$inferSelect,
  inboundMessageId: string,
  body: string,
  messenger: WhatsAppMessenger,
  waContactId: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.replyToMessageId, inboundMessageId),
      ),
    )
    .limit(1);
  if (existing) {
    return; // já respondido (retry do inbox não duplica)
  }
  const { waMessageId } = await messenger.sendText(waContactId, body);
  await db.insert(messages).values({
    orgId,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    senderType: 'BOT',
    body,
    messageType: 'TEXT',
    waMessageId,
    replyToMessageId: inboundMessageId,
  });
}

/** Processa uma mensagem inbound do WhatsApp: vínculo, lead, imóvel, intenção, resposta. */
export async function handleIncomingMessage(
  db: AppDb,
  orgId: string,
  event: WebhookMessageEvent,
  ai: AiProvider,
  messenger: WhatsAppMessenger | null,
): Promise<void> {
  // 1. Persistir inbound (UNIQUE wa_message_id + ON CONFLICT DO NOTHING).
  let conversation = await findActiveConversation(db, orgId, event.waContactId);
  if (!conversation) {
    const partyId = await findOrCreateParty(db, orgId, event.from, null);
    const [created] = await db
      .insert(conversations)
      .values({
        orgId,
        partyId,
        waContactId: event.waContactId,
        waPhoneNumberId: event.phoneNumberId,
        channel: 'whatsapp',
      })
      .returning();
    if (!created) {
      throw new Error('conversation insert failed');
    }
    conversation = created;
    await db.insert(timelineEvents).values({
      orgId,
      entityType: 'CONVERSATION',
      entityId: conversation.id,
      eventType: 'CONVERSATION_CREATED',
      payload: { channel: 'whatsapp' },
    });
  }
  const inbound = await persistMessage(db, orgId, conversation.id, {
    direction: 'INBOUND',
    senderType: 'USER',
    body: event.body,
    waMessageId: event.waMessageId,
  });
  if (!inbound) {
    return; // duplicado (retry) — já processado
  }

  if (!conversation.leadId) {
    conversation.leadId = await createLeadForConversation(
      db,
      orgId,
      conversation.partyId ?? '',
      conversation.id,
    );
  }
  const leadId = conversation.leadId;
  await db
    .update(conversations)
    .set({ status: 'ACTIVE', updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));

  // 3. NEEDS_HUMAN? → sem resposta de bot.
  if (conversation.status === 'NEEDS_HUMAN' || HANDOFF_RE.test(event.body)) {
    if (HANDOFF_RE.test(event.body)) {
      await db
        .update(conversations)
        .set({ status: 'NEEDS_HUMAN', updatedAt: new Date() })
        .where(eq(conversations.id, conversation.id));
      await db.insert(timelineEvents).values({
        orgId,
        entityType: 'CONVERSATION',
        entityId: conversation.id,
        eventType: 'HANDOFF_REQUESTED',
        payload: {},
      });
      await writeAudit(db, {
        orgId,
        action: AUDIT_ACTIONS.CONVERSATION_HANDOFF_REQUESTED,
        entityType: 'CONVERSATION',
        entityId: conversation.id,
      });
      if (messenger) {
        await sendBotReply(
          db,
          orgId,
          conversation,
          inbound.id,
          buildHandoffReply(),
          messenger,
          event.waContactId,
        );
      }
      return;
    }
    return; // em handoff, sem resposta automática
  }

  // 4. Identifica imóvel por código.
  const code = parsePropertyCode(event.body);
  let property: ResolvedProperty | null = null;
  if (code) {
    property = await resolvePropertyByCode(db, orgId, code);
    if (property) {
      const [existingInterest] = await db
        .select()
        .from(leadPropertyInterests)
        .where(
          and(
            eq(leadPropertyInterests.leadId, leadId),
            eq(leadPropertyInterests.propertyId, property.id),
          ),
        )
        .limit(1);
      if (!existingInterest) {
        await db.insert(leadPropertyInterests).values({ orgId, leadId, propertyId: property.id });
      }
      await db.insert(timelineEvents).values({
        orgId,
        entityType: 'LEAD',
        entityId: leadId,
        eventType: 'LEAD_INTEREST',
        payload: { propertyId: property.id, code },
      });
    }
  }

  // 5. Extração de intenção (mock por padrão).
  const extraction = await ai.extractIntent({ text: event.body });
  await db.insert(conversationIntents).values({
    orgId,
    conversationId: conversation.id,
    messageId: inbound.id,
    intent: extraction.intent,
    propertyId: property?.id ?? null,
    budgetMinCents: extraction.budgetMinCents,
    budgetMaxCents: extraction.budgetMaxCents,
    moveInDate: extraction.moveInDate,
    extractedBy: extraction.extractedBy,
    confidence: extraction.confidence,
    raw: { text: event.body.slice(0, 500) },
  });

  // 6. Qualifica: orçamento no lead + avanço de funil.
  if (extraction.budgetMinCents !== null || extraction.budgetMaxCents !== null) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (extraction.budgetMinCents !== null) {
      patch.budgetMinCents = extraction.budgetMinCents;
    }
    if (extraction.budgetMaxCents !== null) {
      patch.budgetMaxCents = extraction.budgetMaxCents;
    }
    await db
      .update(leads)
      .set(patch as never)
      .where(eq(leads.id, leadId));
  }
  await advanceLeadStatus(
    db,
    orgId,
    leadId,
    extraction.intent === 'VISIT_REQUEST' ? 'VISIT' : 'QUALIFYING',
  );

  // 7. Resposta.
  if (!messenger) {
    return;
  }
  if (extraction.intent === 'VISIT_REQUEST') {
    if (extraction.moveInDate) {
      const [visit] = await db
        .insert(visits)
        .values({
          orgId,
          leadId,
          partyId: conversation.partyId ?? null,
          propertyId: property?.id ?? null,
          scheduledAt: new Date(`${extraction.moveInDate}T10:00:00.000Z`),
          status: 'SCHEDULED',
          note: 'Solicitada via WhatsApp',
        })
        .returning();
      await db.insert(timelineEvents).values({
        orgId,
        entityType: 'VISIT',
        entityId: visit?.id ?? '',
        eventType: 'VISIT_REQUESTED',
        payload: { moveInDate: extraction.moveInDate },
      });
      const reply = `Visita agendada para ${extraction.moveInDate} às 10h. Qualquer mudança, é só avisar!`;
      await sendBotReply(db, orgId, conversation, inbound.id, reply, messenger, event.waContactId);
    } else {
      await sendBotReply(
        db,
        orgId,
        conversation,
        inbound.id,
        buildVisitScheduleRequest(),
        messenger,
        event.waContactId,
      );
    }
    return;
  }
  if (property) {
    await sendBotReply(
      db,
      orgId,
      conversation,
      inbound.id,
      buildPropertyReply(property),
      messenger,
      event.waContactId,
    );
    return;
  }
  if (code) {
    await sendBotReply(
      db,
      orgId,
      conversation,
      inbound.id,
      buildPropertyNotFoundReply(code),
      messenger,
      event.waContactId,
    );
    return;
  }
  await sendBotReply(
    db,
    orgId,
    conversation,
    inbound.id,
    buildFallbackReply(),
    messenger,
    event.waContactId,
  );
}

/** Processa um job do webhook inbox (worker injeta ai/messenger). */
export async function processWhatsAppInboxJob(
  db: AppDb,
  job: { id: string; orgId: string; payload: Record<string, unknown> },
  ai: AiProvider,
  messenger: WhatsAppMessenger | null,
): Promise<void> {
  const event = job.payload as unknown as WebhookMessageEvent;
  await handleIncomingMessage(db, job.orgId, event, ai, messenger);
  await writeAudit(db, {
    orgId: job.orgId,
    action: AUDIT_ACTIONS.WHATSAPP_INBOX_PROCESSED,
    entityType: 'WEBHOOK',
    entityId: job.id,
  });
}

/** Resposta do agente humano (síncrona; falha → exceção, sem linha duplicada). */
export async function sendAgentReply(
  db: AppDb,
  orgId: string,
  conversationId: string,
  body: string,
  messenger: WhatsAppMessenger | null,
): Promise<typeof messages.$inferSelect> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)))
    .limit(1);
  if (!conversation) {
    throw new DomainError('NOT_FOUND', 'Conversa não encontrada');
  }
  let waMessageId: string | null = null;
  if (messenger && conversation.waContactId) {
    const result = await messenger.sendText(conversation.waContactId, body);
    waMessageId = result.waMessageId;
  }
  const [message] = await db
    .insert(messages)
    .values({
      orgId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'AGENT',
      body,
      messageType: 'TEXT',
      waMessageId,
    })
    .returning();
  if (!message) {
    throw new Error('message insert failed');
  }
  await db.insert(timelineEvents).values({
    orgId,
    entityType: 'CONVERSATION',
    entityId: conversation.id,
    eventType: 'AGENT_REPLIED',
    payload: {},
  });
  await writeAudit(db, {
    orgId,
    action: AUDIT_ACTIONS.CONVERSATION_MESSAGE_SENT,
    entityType: 'CONVERSATION',
    entityId: conversation.id,
  });
  return message;
}
