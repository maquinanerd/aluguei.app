import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { conversations, conversationIntents, messages } from '@aluguei/db';
import { DomainError } from '@aluguei/domain';
import {
  conversationIntentSchema,
  conversationSchema,
  handoffRequestSchema,
  handoffResponseSchema,
  listConversationsQuerySchema,
  listConversationsResponseSchema,
  listIntentsResponseSchema,
  listLeadConversationsResponseSchema,
  listMessagesQuerySchema,
  listMessagesResponseSchema,
  messageSchema,
  sendMessageRequestSchema,
  sendMessageResponseSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { sendAgentReply } from '../whatsapp/gateway.js';

function toConversationDto(row: typeof conversations.$inferSelect): unknown {
  return conversationSchema.parse({
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    partyId: row.partyId,
    waContactId: row.waContactId,
    status: row.status,
    channel: row.channel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toMessageDto(row: typeof messages.$inferSelect): unknown {
  return messageSchema.parse({
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    direction: row.direction,
    senderType: row.senderType,
    body: row.body,
    messageType: row.messageType,
    waMessageId: row.waMessageId,
    sentAt: row.sentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export const conversationRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get(
    '/conversations',
    { onRequest: [requirePermission('conversation:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = listConversationsQuerySchema.parse(request.query);
      const where = and(
        eq(conversations.orgId, auth.orgId),
        query.status ? eq(conversations.status, query.status) : undefined,
      );
      const rows = await db
        .select()
        .from(conversations)
        .where(where)
        .orderBy(desc(conversations.updatedAt))
        .limit(query.limit)
        .offset(query.offset);
      return listConversationsResponseSchema.parse({
        conversations: rows.map((row) => toConversationDto(row)),
        total: rows.length,
      });
    },
  );

  app.get(
    '/conversations/:id',
    { onRequest: [requirePermission('conversation:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [row] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.orgId, auth.orgId)))
        .limit(1);
      if (!row) {
        throw new DomainError('NOT_FOUND', 'Conversa não encontrada');
      }
      return { conversation: toConversationDto(row) };
    },
  );

  app.get(
    '/conversations/:id/messages',
    { onRequest: [requirePermission('conversation:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const query = listMessagesQuerySchema.parse(request.query);
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.orgId, auth.orgId)))
        .limit(1);
      if (!conversation) {
        throw new DomainError('NOT_FOUND', 'Conversa não encontrada');
      }
      const rows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, id), eq(messages.orgId, auth.orgId)))
        .orderBy(desc(messages.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      return listMessagesResponseSchema.parse({
        messages: rows.map((row) => toMessageDto(row)),
        total: rows.length,
      });
    },
  );

  app.get(
    '/conversations/:id/intents',
    { onRequest: [requirePermission('conversation:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.orgId, auth.orgId)))
        .limit(1);
      if (!conversation) {
        throw new DomainError('NOT_FOUND', 'Conversa não encontrada');
      }
      const rows = await db
        .select()
        .from(conversationIntents)
        .where(
          and(
            eq(conversationIntents.conversationId, id),
            eq(conversationIntents.orgId, auth.orgId),
          ),
        )
        .orderBy(desc(conversationIntents.createdAt));
      return listIntentsResponseSchema.parse({
        intents: rows.map((row) =>
          conversationIntentSchema.parse({
            id: row.id,
            orgId: row.orgId,
            conversationId: row.conversationId,
            intent: row.intent,
            propertyId: row.propertyId,
            budgetMinCents: row.budgetMinCents,
            budgetMaxCents: row.budgetMaxCents,
            moveInDate: row.moveInDate,
            extractedBy: row.extractedBy,
            confidence: row.confidence,
            createdAt: row.createdAt.toISOString(),
          }),
        ),
      });
    },
  );

  app.post(
    '/conversations/:id/messages',
    {
      onRequest: [requirePermission('conversation:write')],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = sendMessageRequestSchema.parse(request.body);
      const message = await sendAgentReply(db, auth.orgId, id, input.body, app.whatsapp);
      return reply
        .status(201)
        .send(sendMessageResponseSchema.parse({ message: toMessageDto(message) }));
    },
  );

  app.post(
    '/conversations/:id/handoff',
    { onRequest: [requirePermission('conversation:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      handoffRequestSchema.parse(request.body);
      const [row] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.orgId, auth.orgId)))
        .limit(1);
      if (!row) {
        throw new DomainError('NOT_FOUND', 'Conversa não encontrada');
      }
      const [updated] = await db
        .update(conversations)
        .set({ status: 'NEEDS_HUMAN', updatedAt: new Date() })
        .where(eq(conversations.id, row.id))
        .returning();
      if (!updated) {
        throw new Error('handoff update failed');
      }
      return handoffResponseSchema.parse({ conversation: toConversationDto(updated) });
    },
  );

  app.get(
    '/leads/:id/conversations',
    { onRequest: [requirePermission('conversation:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const rows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.leadId, id), eq(conversations.orgId, auth.orgId)));
      return listLeadConversationsResponseSchema.parse({
        conversations: rows.map((row) => toConversationDto(row)),
      });
    },
  );

  return Promise.resolve();
};
