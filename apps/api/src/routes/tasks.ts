import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { tasks } from '@aluguei/db';
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
import { first } from './helpers.js';

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

export const taskRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post('/tasks', { onRequest: [requirePermission('task:write')] }, async (request, reply) => {
    const auth = requireAuth(request);
    const input = createTaskRequestSchema.parse(request.body);

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
