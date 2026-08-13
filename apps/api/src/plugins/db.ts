import fp from 'fastify-plugin';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDb;
  }
}

export interface DbPluginOptions {
  db?: AppDb;
  connectionString?: string;
}

/** Registra a instância drizzle. Em testes, injete `db` via options. */
export const dbPlugin = fp<DbPluginOptions>((app, opts) => {
  app.decorate('db', opts.db ?? createDb(opts.connectionString ?? ''));
});
