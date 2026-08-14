import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { AppDb } from '@aluguei/db';
import type { AppEnv } from '@aluguei/config';
import type { StorageService } from '@aluguei/storage';
import type {
  GeocodingService,
  WhatsAppMessenger,
  AiProvider,
  ISignatureProvider,
  IPaymentProvider,
  IMetaAdsProvider,
} from '@aluguei/integrations';
import type { FakeChannel } from '@aluguei/integrations';
import { configPlugin } from './plugins/config.js';
import type { AppConfig } from './plugins/config.js';
import { dbPlugin } from './plugins/db.js';
import type { DbPluginOptions } from './plugins/db.js';
import { sessionPlugin } from './plugins/session.js';
import { storagePlugin } from './plugins/storage.js';
import type { StoragePluginOptions } from './plugins/storage.js';
import { geocodingPlugin } from './plugins/geocoding.js';
import type { GeocodingPluginOptions } from './plugins/geocoding.js';
import { whatsappPlugin } from './plugins/whatsapp.js';
import type { WhatsAppPluginOptions } from './plugins/whatsapp.js';
import { aiPlugin } from './plugins/ai.js';
import type { AiPluginOptions } from './plugins/ai.js';
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
import { propertyRoutes } from './routes/properties.js';
import { listingRoutes } from './routes/listings.js';
import { publicRoutes } from './routes/public.js';
import { channelRoutes } from './routes/channels.js';
import { webhookRoutes } from './routes/webhooks.js';
import { conversationRoutes } from './routes/conversations.js';
import { whatsappConnectionRoutes } from './routes/whatsapp-connections.js';
import { inspectionRoutes } from './routes/inspections.js';
import { rentalApplicationRoutes } from './routes/rental-applications.js';
import { contractTemplateRoutes } from './routes/contract-templates.js';
import { contractRoutes } from './routes/contracts.js';
import { leaseRoutes } from './routes/leases.js';
import { chargeRoutes } from './routes/charges.js';
import { paymentsRoutes } from './routes/payments.js';
import { metaRoutes } from './routes/meta.js';
import { portalRoutes } from './routes/portal.js';
import { reportingRoutes } from './routes/reporting.js';
import { paymentsPlugin } from './plugins/payments.js';
import { signaturePlugin } from './plugins/signature.js';
import { metaPlugin } from './plugins/meta.js';
import { portalSessionPlugin } from './plugins/portal-session.js';
import type { PaymentsPluginOptions } from './plugins/payments.js';
import type { SignaturePluginOptions } from './plugins/signature.js';
import type { MetaPluginOptions } from './plugins/meta.js';
import type { PortalSessionPluginOptions } from './plugins/portal-session.js';

export interface BuildAppOptions extends FastifyServerOptions {
  db?: AppDb;
  env?: AppEnv;
  config?: Partial<AppConfig>;
  storage?: StorageService;
  geocoding?: GeocodingService;
  channels?: { fake?: FakeChannel };
  whatsapp?: WhatsAppMessenger;
  ai?: AiProvider;
  signature?: ISignatureProvider;
  payments?: IPaymentProvider;
  meta?: IMetaAdsProvider;
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
  const storageOptions: StoragePluginOptions = {};
  if (opts.storage) {
    storageOptions.storage = opts.storage;
  }
  if (env.STORAGE_ENDPOINT) {
    storageOptions.endpoint = env.STORAGE_ENDPOINT;
  }
  if (env.STORAGE_REGION) {
    storageOptions.region = env.STORAGE_REGION;
  }
  if (env.STORAGE_BUCKET) {
    storageOptions.bucket = env.STORAGE_BUCKET;
  }
  if (env.STORAGE_ACCESS_KEY_ID) {
    storageOptions.accessKeyId = env.STORAGE_ACCESS_KEY_ID;
  }
  if (env.STORAGE_SECRET_ACCESS_KEY) {
    storageOptions.secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY;
  }
  await app.register(storagePlugin, storageOptions);

  const geocodingOptions: GeocodingPluginOptions = { nodeEnv: env.NODE_ENV };
  if (opts.geocoding) {
    geocodingOptions.geocoding = opts.geocoding;
  }
  if (env.GOOGLE_MAPS_API_KEY) {
    geocodingOptions.apiKey = env.GOOGLE_MAPS_API_KEY;
  }
  await app.register(geocodingPlugin, geocodingOptions);

  const whatsappOptions: WhatsAppPluginOptions = {};
  if (opts.whatsapp) {
    whatsappOptions.messenger = opts.whatsapp;
  }
  if (env.META_MODE) {
    whatsappOptions.mode = env.META_MODE;
  }
  if (env.WHATSAPP_ACCESS_TOKEN) {
    whatsappOptions.accessToken = env.WHATSAPP_ACCESS_TOKEN;
  }
  if (env.WHATSAPP_PHONE_NUMBER_ID) {
    whatsappOptions.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  }
  if (env.META_WEBHOOK_VERIFY_TOKEN) {
    whatsappOptions.verifyToken = env.META_WEBHOOK_VERIFY_TOKEN;
  }
  await app.register(whatsappPlugin, whatsappOptions);

  const aiOptions: AiPluginOptions = {};
  if (opts.ai) {
    aiOptions.ai = opts.ai;
  }
  if (env.AI_PROVIDER) {
    aiOptions.provider = env.AI_PROVIDER;
  }
  if (env.OPENAI_API_KEY) {
    aiOptions.openAiKey = env.OPENAI_API_KEY;
  }
  if (env.GEMINI_API_KEY) {
    aiOptions.geminiKey = env.GEMINI_API_KEY;
  }
  await app.register(aiPlugin, aiOptions);

  app.decorate('channels', opts.channels ?? {});
  const signatureOptions: SignaturePluginOptions = {};
  if (opts.signature) {
    signatureOptions.signature = opts.signature;
  }
  if (env.CLICKSIGN_API_TOKEN) {
    signatureOptions.token = env.CLICKSIGN_API_TOKEN;
  }
  if (env.D4SIGN_API_TOKEN) {
    signatureOptions.token = env.D4SIGN_API_TOKEN;
  }
  await app.register(signaturePlugin, signatureOptions);
  const paymentsOptions: PaymentsPluginOptions = {};
  if (opts.payments) {
    paymentsOptions.payments = opts.payments;
  }
  if (env.ASAAS_API_KEY) {
    paymentsOptions.apiKey = env.ASAAS_API_KEY;
  }
  await app.register(paymentsPlugin, paymentsOptions);

  const metaOptions: MetaPluginOptions = {};
  if (opts.meta) {
    metaOptions.meta = opts.meta;
  }
  if (env.META_MODE) {
    metaOptions.mode = env.META_MODE;
  }
  if (env.META_ACCESS_TOKEN) {
    metaOptions.accessToken = env.META_ACCESS_TOKEN;
  }
  await app.register(metaPlugin, metaOptions);

  const portalSessionOptions: PortalSessionPluginOptions = {
    db: app.db,
    cookieName: 'aluguei_portal',
  };
  await app.register(portalSessionPlugin, portalSessionOptions);

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
  await app.register(propertyRoutes);
  await app.register(listingRoutes);
  await app.register(publicRoutes);
  await app.register(channelRoutes);
  await app.register(webhookRoutes);
  await app.register(conversationRoutes);
  await app.register(whatsappConnectionRoutes);
  await app.register(inspectionRoutes);
  await app.register(rentalApplicationRoutes);
  await app.register(contractTemplateRoutes);
  await app.register(contractRoutes);
  await app.register(leaseRoutes);
  await app.register(chargeRoutes);
  await app.register(paymentsRoutes);
  await app.register(metaRoutes);
  await app.register(portalRoutes);
  await app.register(reportingRoutes);

  return app;
}
