import type { FastifyPluginAsync } from 'fastify';
import { healthResponseSchema } from '@aluguei/contracts';

const SERVICE_VERSION = '0.1.0';

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

  return Promise.resolve();
};
