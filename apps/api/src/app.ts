import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { AppDb } from '@aluguei/db';
import type { AppEnv } from '@aluguei/config';
import { configPlugin } from './plugins/config.js';
import type { AppConfig } from './plugins/config.js';
import { dbPlugin } from './plugins/db.js';
import type { DbPluginOptions } from './plugins/db.js';
import { sessionPlugin } from './plugins/session.js';
import { setErrorHandler } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { organizationRoutes } from './routes/organizations.js';
import { leadRoutes } from './routes/leads.js';
import { partyRoutes } from './routes/parties.js';
import { taskRoutes } from './routes/tasks.js';
import { visitRoutes } from './routes/visits.js';
import { proposalRoutes } from './routes/proposals.js';
import { timelineRoutes } from './routes/timeline.js';

export interface BuildAppOptions extends FastifyServerOptions {
  db?: AppDb;
  env?: AppEnv;
  config?: Partial<AppConfig>;
}

function resolveConfig(env: AppEnv, overrides?: Partial<AppConfig>): AppConfig {
  const corsOrigins =
    overrides?.corsOrigins ??
    (env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : [env.APP_BASE_URL]);
  return {
    sessionTtlSeconds: overrides?.sessionTtlSeconds ?? env.SESSION_TTL_SECONDS,
    cookieSecure:
      overrides?.cookieSecure ??
      (env.COOKIE_SECURE === 'true' ||
        (env.COOKIE_SECURE === undefined && env.NODE_ENV === 'production')),
    cookieName: overrides?.cookieName ?? 'aluguei_session',
    appBaseUrl: overrides?.appBaseUrl ?? env.APP_BASE_URL,
    corsOrigins,
  };
}

/** Monta o app Fastify com plugins de segurança, sessão, RBAC e rotas. */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env: AppEnv = opts.env ?? {
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
    API_HOST: '0.0.0.0',
    API_PORT: 4000,
    APP_BASE_URL: 'http://localhost:3000',
    SESSION_TTL_SECONDS: 2_592_000,
  };
  const config = resolveConfig(env, opts.config);

  // IMPORTANTE: não fazer spread de `opts` no Fastify() — BuildAppOptions contém
  // db/env/config (ex.: PGlite com buffers WASM) que o Fastify clonaria via rfdc.
  const app = Fastify({ logger: opts.logger ?? false });
  setErrorHandler(app);

  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(configPlugin, { config });
  const dbOptions: DbPluginOptions = {};
  if (opts.db) {
    dbOptions.db = opts.db;
  }
  if (env.DATABASE_URL) {
    dbOptions.connectionString = env.DATABASE_URL;
  }
  await app.register(dbPlugin, dbOptions);
  await app.register(sessionPlugin, {
    db: app.db,
    cookieName: config.cookieName,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(organizationRoutes);
  await app.register(leadRoutes);
  await app.register(partyRoutes);
  await app.register(taskRoutes);
  await app.register(visitRoutes);
  await app.register(proposalRoutes);
  await app.register(timelineRoutes);

  return app;
}
