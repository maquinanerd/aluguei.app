import { z } from 'zod';
import { planModuleSchema } from './common.js';

/**
 * Planos na vitrine pública (`/planos` e `/para-imobiliarias` do portal, Onda 3).
 *
 * É uma view reduzida do plano, não o plano inteiro: sai o `id`, sai a contagem
 * de imobiliárias e sai o `isActive` — plano inativo simplesmente não aparece. O
 * portal é público, então cada campo aqui é uma decisão de exposição.
 *
 * `monthlyPriceCents` nulo **não** é zero: é "Fale com a gente", e a tela precisa
 * distinguir os dois. Mesma regra dos limites, onde nulo é ilimitado.
 */
export const publicPlanSchema = z.object({
  /** Código estável, usado no `?plano=` do cadastro. */
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** null = ilimitado. */
  maxUsers: z.number().int().nullable(),
  maxProperties: z.number().int().nullable(),
  maxPublishedListings: z.number().int().nullable(),
  maxActiveLeases: z.number().int().nullable(),
  modules: z.array(planModuleSchema),
  /** null = sem preço publicado ("Fale com a gente"). */
  monthlyPriceCents: z.number().int().nullable(),
});

export const publicPlansResponseSchema = z.object({ plans: z.array(publicPlanSchema) });

export type PublicPlan = z.infer<typeof publicPlanSchema>;
export type PublicPlansResponse = z.infer<typeof publicPlansResponseSchema>;
