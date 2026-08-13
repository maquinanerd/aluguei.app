import fp from 'fastify-plugin';

export interface AppConfig {
  sessionTtlSeconds: number;
  cookieSecure: boolean;
  cookieName: string;
  appBaseUrl: string;
  corsOrigins: string[];
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export const configPlugin = fp<{ config: AppConfig }>((app, opts) => {
  app.decorate('config', opts.config);
});
