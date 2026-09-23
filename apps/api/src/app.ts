import Fastify, {
  type FastifyInstance,
  type FastifyPluginAsync,
  type FastifyServerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { AppDb } from '@aluguei/db';
import { createDbFakePaymentStore } from '@aluguei/db';
import { resolveMetaMode } from '@aluguei/config';
import type { AppEnv } from '@aluguei/config';
import { annotateHttpRoute } from '@aluguei/observability';
import { parsePlatformAdminEmails } from '@aluguei/domain';
import type { PlanModule } from '@aluguei/domain';
import { requireModule } from './plugins/authz.js';
import type { StorageService } from '@aluguei/storage';
import type {
  GeocodingService,
  PlacesService,
  WhatsAppMessenger,
  WhatsAppNumberVerifier,
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
import { placesPlugin } from './plugins/places.js';
import type { PlacesPluginOptions } from './plugins/places.js';
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
import { placesRoutes } from './routes/places.js';
import { listingRoutes } from './routes/listings.js';
import { publicRoutes } from './routes/public.js';
import { publicSearchRoutes } from './routes/public-search.js';
import { publicPortalRoutes } from './routes/public-portal.js';
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
import { devPaymentRoutes } from './routes/dev-payments.js';
import { devOutboxRoutes } from './routes/dev-outbox.js';
import { metaRoutes } from './routes/meta.js';
import { portalRoutes } from './routes/portal.js';
import { reportingRoutes } from './routes/reporting.js';
import { platformRoutes } from './routes/platform.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { paymentsPlugin } from './plugins/payments.js';
import { signaturePlugin } from './plugins/signature.js';
import { metaPlugin } from './plugins/meta.js';
import { portalSessionPlugin } from './plugins/portal-session.js';
import type { PaymentsPluginOptions } from './plugins/payments.js';
import type { SignaturePluginOptions } from './plugins/signature.js';
import type { MetaPluginOptions } from './plugins/meta.js';
import type { PortalSessionPluginOptions } from './plugins/portal-session.js';

/** Trava e contagem do plano — exportadas para a suíte de concorrência real (test:pg). */
export { assertPlanAllowsOneMore } from './platform/usage.js';
/** Conta do admin da plataforma (comando de servidor e testes). */
export { createPlatformAdminAccount } from './platform/bootstrap.js';

export interface BuildAppOptions extends FastifyServerOptions {
  db?: AppDb;
  env?: AppEnv;
  config?: Partial<AppConfig>;
  storage?: StorageService;
  geocoding?: GeocodingService;
  places?: PlacesService;
  channels?: { fake?: FakeChannel };
  whatsapp?: WhatsAppMessenger;
  /** Verificador da posse do número (P1-18); padrão pelo modo da Meta (FAKE em dry_run). */
  whatsappVerifier?: WhatsAppNumberVerifier;
  ai?: AiProvider;
  signature?: ISignatureProvider;
  payments?: IPaymentProvider;
  meta?: IMetaAdsProvider;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Env tipado (AppEnv validado por zod) — acessível em rotas e plugins. */
    env: AppEnv;
  }
}

/** Key de rate limit: IP quando não autenticado; userId quando autenticado. */
function defaultKeyGenerator(request: { ip?: string; auth?: { userId: string } | null }): string {
  const userId = request.auth?.userId;
  return userId ? `user:${userId}` : `ip:${request.ip ?? 'unknown'}`;
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
    platformAdminEmails:
      overrides?.platformAdminEmails ?? parsePlatformAdminEmails(env.PLATFORM_ADMIN_EMAILS),
  };
}

/** Monta o app Fastify com plugins de segurança, sessão, RBAC e rotas. */

/**
 * Registra rotas num escopo próprio com o hook do módulo do plano. Os arquivos de
 * rota são plugins comuns (sem `fastify-plugin`), então o hook do escopo vale só
 * para elas — e cada rota mantém o seu `requirePermission`.
 */
async function registerBehindModule(
  app: FastifyInstance,
  module: PlanModule,
  routes: readonly FastifyPluginAsync[],
): Promise<void> {
  await app.register(async (scope) => {
    scope.addHook('onRequest', requireModule(module));
    for (const route of routes) {
      await scope.register(route);
    }
  });
}

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
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 1024 * 1024, // 1MB — uploads reais vão por presigned PUT (storage)
    maxParamLength: 128,
    // Confia apenas em proxies loopback (Next.js no mesmo host). NUNCA trustProxy
    // irrestrito: permitiria spoofing de IP se a API fosse acessada diretamente.
    trustProxy: 'loopback',
  });
  setErrorHandler(app);

  // Env tipado (AppEnv validado por zod) disponível em rotas/plugins.
  app.decorate('env', env);

  // Span do request com a rota do Fastify (`GET /properties/:id`) e `http.route` — sem
  // telemetria ligada, não faz nada (auditoria 2026-09-10, P2-11).
  app.addHook('onRequest', (request, _reply, done) => {
    annotateHttpRoute(request.method, request.routeOptions.url);
    done();
  });

  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  // Rate limit global por IP: 300 req/min. Rotas sensíveis têm limites menores.
  // Store: Redis quando configurado (multi-instância); senão memória por processo.
  const rateLimitOptions: {
    max: number;
    timeWindow: string;
    keyGenerator: typeof defaultKeyGenerator;
  } & Record<string, unknown> = {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: defaultKeyGenerator,
  };
  if (env.REDIS_URL) {
    // O store Redis do plugin registra comandos Lua (`defineCommand`): precisa do client
    // ioredis, não do adapter get/set/del (auditoria 2026-09-10, P1-14).
    const { closeRateLimitRedis, createRateLimitRedis } = await import('@aluguei/integrations');
    const redis = createRateLimitRedis(env.REDIS_URL, {
      onError: (err) => {
        app.log.warn({ err }, 'rate limit: falha na conexão com o Redis');
      },
    });
    app.addHook('onClose', async () => {
      await closeRateLimitRedis(redis);
    });
    rateLimitOptions.redis = redis;
    rateLimitOptions.nameSpace = 'aluguei:rate-limit:';
    // Redis fora do ar não derruba a API: a requisição passa sem contar (e o erro de
    // conexão fica no log). Decisão registrada no rascunho de ADR da Trilha F.
    rateLimitOptions.skipOnError = true;
  }
  await app.register(rateLimit, rateLimitOptions);
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
    platformAdminEmails: config.platformAdminEmails,
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
  if (env.STORAGE_FORCE_PATH_STYLE === 'true') {
    storageOptions.forcePathStyle = true;
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

  const placesOptions: PlacesPluginOptions = { nodeEnv: env.NODE_ENV };
  if (opts.places) {
    placesOptions.places = opts.places;
  }
  if (env.GOOGLE_MAPS_API_KEY) {
    placesOptions.apiKey = env.GOOGLE_MAPS_API_KEY;
  }
  await app.register(placesPlugin, placesOptions);

  // Modo da Meta: o configurado; `dry_run` só fora de produção e só sem META_MODE. Em produção
  // sem modo, WhatsApp e Meta Ads ficam "não configurados" — nunca FAKE (P1-12).
  const metaMode = resolveMetaMode(env);
  const whatsappOptions: WhatsAppPluginOptions = {};
  if (opts.whatsapp) {
    whatsappOptions.messenger = opts.whatsapp;
  }
  if (opts.whatsappVerifier) {
    whatsappOptions.verifier = opts.whatsappVerifier;
  }
  if (metaMode) {
    whatsappOptions.mode = metaMode;
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
  if (env.SIGNATURE_PROVIDER) {
    signatureOptions.provider = env.SIGNATURE_PROVIDER;
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
  if (env.PAYMENT_PROVIDER) {
    paymentsOptions.provider = env.PAYMENT_PROVIDER;
  }
  if (env.ASAAS_API_KEY) {
    paymentsOptions.apiKey = env.ASAAS_API_KEY;
  }
  if (env.ASAAS_ENV) {
    paymentsOptions.env = env.ASAAS_ENV;
  }
  if (!opts.payments) {
    // Provider FAKE guarda o estado em tabela: API e worker são processos
    // separados e precisam ver a mesma cobrança (auditoria 2026-09-10, P1-13).
    paymentsOptions.fakeStore = createDbFakePaymentStore(app.db);
  }
  await app.register(paymentsPlugin, paymentsOptions);

  const metaOptions: MetaPluginOptions = {};
  if (opts.meta) {
    metaOptions.meta = opts.meta;
  }
  if (metaMode) {
    metaOptions.mode = metaMode;
  }
  if (env.META_ACCESS_TOKEN) {
    metaOptions.accessToken = env.META_ACCESS_TOKEN;
  }
  if (env.META_AD_ACCOUNT_ID) {
    metaOptions.adAccountId = env.META_AD_ACCOUNT_ID;
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
  await app.register(timelineRoutes);
  await app.register(propertyRoutes);
  await app.register(placesRoutes);
  await app.register(listingRoutes);
  await app.register(publicRoutes);
  await app.register(publicSearchRoutes);
  await app.register(publicPortalRoutes);
  await app.register(channelRoutes);
  await app.register(webhookRoutes);
  // Grupos atrás do módulo do plano: fora do plano a API responde 403 com
  // `details.reason = PLAN_MODULE_NOT_INCLUDED` e o painel abre a tela de upgrade.
  await registerBehindModule(app, 'CRM', [visitRoutes, proposalRoutes]);
  await registerBehindModule(app, 'ATENDIMENTO', [conversationRoutes, whatsappConnectionRoutes]);
  await registerBehindModule(app, 'LOCACAO', [
    inspectionRoutes,
    rentalApplicationRoutes,
    contractTemplateRoutes,
    contractRoutes,
    leaseRoutes,
  ]);
  await registerBehindModule(app, 'FINANCEIRO', [chargeRoutes, paymentsRoutes]);
  if (env.NODE_ENV !== 'production') {
    // Simulação do pagador com provider FAKE (dev/E2E) — nunca em produção.
    await app.register(devPaymentRoutes);
    // Leitura da caixa de saída local por destinatário (dev/E2E) — nunca em produção.
    await app.register(devOutboxRoutes);
  }
  await registerBehindModule(app, 'MARKETING', [metaRoutes]);
  await app.register(portalRoutes);
  await app.register(reportingRoutes);
  await app.register(dashboardRoutes);
  await app.register(platformRoutes);

  return app;
}
