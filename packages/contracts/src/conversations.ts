import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const conversationStatusSchema = z.enum(['OPEN', 'ACTIVE', 'NEEDS_HUMAN', 'CLOSED']);

export const conversationSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  leadId: uuidSchema.nullable(),
  partyId: uuidSchema.nullable(),
  waContactId: z.string().nullable(),
  status: conversationStatusSchema,
  channel: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const messageSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  conversationId: uuidSchema,
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  senderType: z.enum(['USER', 'AGENT', 'BOT']),
  body: z.string(),
  messageType: z.string(),
  waMessageId: z.string().nullable(),
  sentAt: z.string(),
  createdAt: z.string(),
});

export const conversationIntentSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  conversationId: uuidSchema,
  intent: z.enum(['VISIT_REQUEST', 'PRICE_QUERY', 'AVAILABILITY', 'OTHER']),
  propertyId: uuidSchema.nullable(),
  budgetMinCents: z.number().int().nullable(),
  budgetMaxCents: z.number().int().nullable(),
  moveInDate: z.string().nullable(),
  extractedBy: z.enum(['AI', 'RULE']),
  confidence: z.number().nullable(),
  createdAt: z.string(),
});

export const listConversationsQuerySchema = paginationQuerySchema.extend({
  status: conversationStatusSchema.optional(),
});

export const listConversationsResponseSchema = z.object({
  conversations: z.array(conversationSchema),
  total: z.number().int().nonnegative(),
});

export const listMessagesQuerySchema = paginationQuerySchema;

export const listMessagesResponseSchema = z.object({
  messages: z.array(messageSchema),
  total: z.number().int().nonnegative(),
});

export const listIntentsResponseSchema = z.object({
  intents: z.array(conversationIntentSchema),
});

export const sendMessageRequestSchema = z.object({
  body: z.string().min(1).max(4096),
});

export const sendMessageResponseSchema = z.object({ message: messageSchema });

export const handoffRequestSchema = z.object({});

export const handoffResponseSchema = z.object({
  conversation: conversationSchema,
});

export const listLeadConversationsResponseSchema = z.object({
  conversations: z.array(conversationSchema),
});

export const createWhatsAppConnectionRequestSchema = z.object({
  phoneNumberId: z.string().min(1),
  businessAccountId: z.string().optional(),
});

export const whatsAppConnectionSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  phoneNumberId: z.string(),
  businessAccountId: z.string().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED']),
  createdAt: z.string(),
});

export const listWhatsAppConnectionsResponseSchema = z.object({
  connections: z.array(whatsAppConnectionSchema),
});
