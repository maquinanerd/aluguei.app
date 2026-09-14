import { z } from 'zod';

export const uuidSchema = z.uuid();

export const roleSchema = z.enum(['owner', 'admin', 'agent', 'inspector', 'finance', 'viewer']);

export const funnelStatusSchema = z.enum([
  'NEW',
  'QUALIFYING',
  'QUALIFIED',
  'VISIT',
  'PROPOSAL',
  'APPLICATION',
  'WON',
  'LOST',
]);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Texto de busca opcional (até 100 caracteres); vazio equivale a ausente. */
export const searchTextQuerySchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(100).optional(),
);

/**
 * Ids separados por vírgula — de 1 a 100 uuids — para resolver as referências
 * de uma página sem carregar a organização inteira (auditoria 2026-09-10, P1-01).
 */
export const idListQuerySchema = z
  .string()
  .transform((value) => value.split(',').map((id) => id.trim()))
  .pipe(z.array(uuidSchema).min(1).max(100));
