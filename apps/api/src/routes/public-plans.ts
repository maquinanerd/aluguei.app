import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { plans } from '@aluguei/db';
import { normalizePlanModules } from '@aluguei/domain';
import { publicPlansResponseSchema } from '@aluguei/contracts';

/**
 * Planos da vitrine pública (Onda 3). Sem sessão: é a tabela que o portal mostra
 * em `/planos` e em `/para-imobiliarias`.
 *
 * Só plano **ativo** sai daqui, e a resposta é a view reduzida do contrato — sem
 * `id` e sem contagem de imobiliárias, que são dado de operação e não de vitrine.
 * A ordem é a do preço publicado, com os sem preço no fim: a tabela da tela lê na
 * ordem que vem, e "Fale com a gente" é o último degrau, não o primeiro.
 */
export const publicPlansRoutes: FastifyPluginAsync = (app) => {
  app.get(
    '/public/plans',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async () => {
      const linhas = await app.db
        .select({
          code: plans.code,
          name: plans.name,
          description: plans.description,
          maxUsers: plans.maxUsers,
          maxProperties: plans.maxProperties,
          maxPublishedListings: plans.maxPublishedListings,
          maxActiveLeases: plans.maxActiveLeases,
          modules: plans.modules,
          monthlyPriceCents: plans.monthlyPriceCents,
        })
        .from(plans)
        .where(eq(plans.isActive, true))
        .orderBy(asc(plans.code));

      const ordenados = [...linhas].sort((a, b) => {
        if (a.monthlyPriceCents === null && b.monthlyPriceCents === null) {
          return a.code.localeCompare(b.code);
        }
        if (a.monthlyPriceCents === null) {
          return 1;
        }
        if (b.monthlyPriceCents === null) {
          return -1;
        }
        return a.monthlyPriceCents - b.monthlyPriceCents;
      });

      return publicPlansResponseSchema.parse({
        plans: ordenados.map((linha) => ({
          ...linha,
          modules: normalizePlanModules(linha.modules),
        })),
      });
    },
  );

  return Promise.resolve();
};
