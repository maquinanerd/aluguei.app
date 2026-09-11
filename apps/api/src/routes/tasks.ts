import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { leads, parties, properties, proposals, tasks, visits } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError } from '@aluguei/domain';
import {
  uuidSchema,
  createTaskRequestSchema,
  createTaskResponseSchema,
  listTasksQuerySchema,
  listTasksResponseSchema,
  taskSchema,
  updateTaskStatusRequestSchema,
  updateTaskStatusResponseSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { assertOrgMember, assertOwnedByOrg, first } from './helpers.js';

function toTaskDto(row: typeof tasks.$inferSelect): unknown {
  return taskSchema.parse({
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    assigneeUserId: row.assigneeUserId,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Entidades que uma tarefa pode referenciar (o id é sempre da própria org). */
const TASK_RELATED_TABLES = {
  LEAD: leads,
  PARTY: parties,
  PROPOSAL: proposals,
  VISIT: visits,
  PROPERTY: properties,
} as const;

type TaskRelatedType = keyof typeof TASK_RELATED_TABLES;

function isTaskRelatedType(value: string): value is TaskRelatedType {
  return Object.hasOwn(TASK_RELATED_TABLES, value);
}

/**
 * P0-05: tipo e id andam juntos, o tipo precisa ser conhecido e o id precisa
 * apontar para uma entidade da própria organização (id de outra org ou
 * inexistente → mesmo 404).
 */
async function assertRelatedEntityOfOrg(
  db: AppDb,
  orgId: string,
  relatedEntityType: string | undefined,
  relatedEntityId: string | undefined,
): Promise<void> {
  if (relatedEntityType === undefined && relatedEntityId === undefined) {
    return;
  }
  if (relatedEntityType === undefined || relatedEntityId === undefined) {
    throw new DomainError(
      'INVALID_INPUT',
      'Informe relatedEntityType e relatedEntityId em conjunto',
    );
  }
  if (!isTaskRelatedType(relatedEntityType)) {
    throw new DomainError(
      'INVALID_INPUT',
      `Tipo de entidade relacionada inválido: ${relatedEntityType}`,
    );
  }
  await assertOwnedByOrg(
    db,
    TASK_RELATED_TABLES[relatedEntityType],
    relatedEntityId,
    orgId,
    'Entidade relacionada não encontrada',
  );
}

export const taskRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post('/tasks', { onRequest: [requirePermission('task:write')] }, async (request, reply) => {
    const auth = requireAuth(request);
    const input = createTaskRequestSchema.parse(request.body);

    // P0-05: responsável precisa ser membro da org; a entidade relacionada, da org.
    await assertOrgMember(
      db,
      auth.orgId,
      input.assigneeUserId,
      'Usuário responsável não encontrado',
    );
    await assertRelatedEntityOfOrg(db, auth.orgId, input.relatedEntityType, input.relatedEntityId);

    const task = first(
      await db
        .insert(tasks)
        .values({
          orgId: auth.orgId,
          title: input.title,
          description: input.description ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          assigneeUserId: input.assigneeUserId ?? null,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          createdBy: auth.userId,
        })
        .returning(),
    );

    await writeAudit(db, {
      orgId: auth.orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.TASK_CREATED,
      entityType: 'TASK',
      entityId: task.id,
    });

    return reply.status(201).send(createTaskResponseSchema.parse({ task: toTaskDto(task) }));
  });

  app.get('/tasks', { onRequest: [requirePermission('task:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listTasksQuerySchema.parse(request.query);
    const where = and(
      eq(tasks.orgId, auth.orgId),
      query.status ? eq(tasks.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(desc(tasks.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return listTasksResponseSchema.parse({
      tasks: rows.map((row) => toTaskDto(row)),
      total: rows.length,
    });
  });

  app.patch(
    '/tasks/:id/status',
    { onRequest: [requirePermission('task:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateTaskStatusRequestSchema.parse(request.body);

      const [task] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.orgId, auth.orgId)))
        .limit(1);
      if (!task) {
        throw new DomainError('NOT_FOUND', 'Tarefa não encontrada');
      }
      const updated = first(
        await db
          .update(tasks)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(tasks.id, task.id))
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.TASK_STATUS_CHANGED,
        entityType: 'TASK',
        entityId: task.id,
        payload: { from: task.status, to: input.status },
      });

      return updateTaskStatusResponseSchema.parse({ task: toTaskDto(updated) });
    },
  );
  return Promise.resolve();
};
