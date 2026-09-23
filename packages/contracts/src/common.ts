import { z } from 'zod';

export const uuidSchema = z.uuid();

/**
 * Teto de um valor em centavos que a API recebe: R$ 1.000.000,00 (o mesmo `MAX_AMOUNT_CENTS` do
 * domínio e do campo de dinheiro do painel). As colunas por linha são int4 e a cobrança soma
 * várias parcelas com multa e juros; acima do teto a API responde 400 em vez de estourar o INSERT.
 */
export const MAX_AMOUNT_CENTS = 100_000_000;

/**
 * Módulos que um plano pode incluir; a lista canônica é `PLAN_MODULES`
 * (`packages/domain`) e o CHECK `plans_modules_valid` no banco.
 */
export const planModuleSchema = z.enum([
  'CRM',
  'ATENDIMENTO',
  'LOCACAO',
  'FINANCEIRO',
  'VENDAS',
  'MARKETING',
]);
/** Maior valor de uma coluna `integer` (int4): guarda do que vem de fora (webhook do provider). */
export const INT4_MAX = 2_147_483_647;

const ceilingMessage = 'O valor máximo é R$ 1.000.000,00';

/** Centavos informados (zero aceito), até o teto. */
export const amountCentsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_AMOUNT_CENTS, ceilingMessage);
/** Centavos informados, maior que zero, até o teto. */
export const positiveAmountCentsSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_AMOUNT_CENTS, ceilingMessage);

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
