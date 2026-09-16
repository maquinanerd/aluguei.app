import fp from 'fastify-plugin';

export interface AppConfig {
  sessionTtlSeconds: number;
  cookieSecure: boolean;
  cookieName: string;
  appBaseUrl: string;
  corsOrigins: string[];
  /** E-mails normalizados de `PLATFORM_ADMIN_EMAILS`; vazio: ninguém é admin da plataforma. */
  platformAdminEmails: ReadonlySet<string>;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export const configPlugin = fp<{ config: AppConfig }>((app, opts) => {
  app.decorate('config', opts.config);
});
