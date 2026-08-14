import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { healthResponseSchema, readinessResponseSchema } from '@aluguei/contracts';

const SERVICE_VERSION = '0.1.0';

/** Liveness: processo vivo (sem dependências). */
export const healthRoutes: FastifyPluginAsync = (app) => {
  app.get('/health', () => {
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString(),
      uptimeMs: Math.round(process.uptime() * 1000),
    });
  });

  /**
   * Readiness: verifica dependências reais (DB) antes de aceitar tráfego.
   * 503 quando o banco não responde — sem detalhes internos no body.
   */
  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
    } catch {
      app.log.error('health/ready: banco indisponível');
      return reply.status(503).send(
        readinessResponseSchema.parse({
          status: 'unavailable',
          service: 'api',
          checks: { db: 'down' },
          timestamp: new Date().toISOString(),
        }),
      );
    }
    return reply.status(200).send(
      readinessResponseSchema.parse({
        status: 'ok',
        service: 'api',
        checks: { db: 'up' },
        timestamp: new Date().toISOString(),
      }),
    );
  });

  return Promise.resolve();
};
