import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const taskStatusSchema = z.enum(['OPEN', 'DONE', 'CANCELLED']);

export const taskSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  dueAt: z.string().nullable(),
  assigneeUserId: uuidSchema.nullable(),
  relatedEntityType: z.string().nullable(),
  relatedEntityId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createTaskRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  dueAt: z.string().optional(),
  assigneeUserId: uuidSchema.optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
});

export const createTaskResponseSchema = z.object({ task: taskSchema });

export const listTasksQuerySchema = paginationQuerySchema.extend({
  status: taskStatusSchema.optional(),
});

export const listTasksResponseSchema = z.object({
  tasks: z.array(taskSchema),
  total: z.number().int().nonnegative(),
});

export const updateTaskStatusRequestSchema = z.object({ status: taskStatusSchema });

export const updateTaskStatusResponseSchema = z.object({ task: taskSchema });
