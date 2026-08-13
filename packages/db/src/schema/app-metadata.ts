import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Tabela de infraestrutura (chave/valor) — sem domínio de negócio na Fase 01. */
export const appMetadata = pgTable('app_metadata', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AppMetadata = typeof appMetadata.$inferSelect;
export type NewAppMetadata = typeof appMetadata.$inferInsert;
