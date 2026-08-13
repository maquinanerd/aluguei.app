import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { healthRoutes } from './routes/health.js';

/** Monta o app Fastify com plugins de segurança, CORS e rotas de infraestrutura. */
export async function buildApp(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, ...opts });

  await app.register(helmet);
  await app.register(cors, { origin: true });

  await app.register(healthRoutes);

  return app;
}
