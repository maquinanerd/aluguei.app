import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { domainCheck } from './checks.js';
import { organizations, users } from './identity.js';

/**
 * Pedido de troca de plano feito pela própria imobiliária, na tela de upgrade (rodada de
 * fidelidade, ADR-105, B15). Quem troca o plano continua sendo a equipe da plataforma
 * (`PUT /platform/organizations/:id/plan`): o pedido só registra a intenção e entra na fila da
 * plataforma. No máximo um pedido em aberto por imobiliária — pedir de novo devolve o mesmo.
 */
export const planChangeRequests = pgTable(
  'plan_change_requests',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Módulo que a imobiliária quis abrir (o cadeado que ela clicou). */
    requestedModule: text('requested_module'),
    /** Plano escolhido, quando o pedido veio da comparação de planos. */
    requestedPlanCode: text('requested_plan_code'),
    status: text('status').notNull().default('PENDING'), // PENDING | DONE | DISMISSED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    domainCheck('plan_change_requests_status_valid', t.status, ['PENDING', 'DONE', 'DISMISSED']),
    domainCheck(
      'plan_change_requests_requested_module_valid',
      t.requestedModule,
      ['CRM', 'ATENDIMENTO', 'LOCACAO', 'FINANCEIRO', 'VENDAS', 'MARKETING'],
      { nullable: true },
    ),
    check(
      'plan_change_requests_target_required',
      sql`${t.requestedModule} is not null or ${t.requestedPlanCode} is not null`,
    ),
    check(
      'plan_change_requests_resolution_consistent',
      sql`(${t.status} = 'PENDING') = (${t.resolvedAt} is null)`,
    ),
    uniqueIndex('plan_change_requests_one_pending_per_org')
      .on(t.orgId)
      .where(sql`${t.status} = 'PENDING'`),
    index('plan_change_requests_status_created_idx').on(t.status, t.createdAt),
  ],
);
