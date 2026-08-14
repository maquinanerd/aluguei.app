import { z } from 'zod';

/**
 * Schema de configuração da aplicação. Nunca contenha segredos em valores default.
 * Credenciais de integrações (Meta, WhatsApp, pagamentos, etc.) são validadas pelos
 * pacotes específicos em fases futuras — o schema aqui cobre apenas infraestrutura.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().default(4000),
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000), // 30 dias
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  META_MODE: z.enum(['dry_run', 'live']).optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  SERASA_CLIENT_ID: z.string().optional(),
  SERASA_CLIENT_SECRET: z.string().optional(),
  SPC_CLIENT_ID: z.string().optional(),
  SPC_CLIENT_SECRET: z.string().optional(),
  CLICKSIGN_API_TOKEN: z.string().optional(),
  D4SIGN_API_TOKEN: z.string().optional(),
  SIGNATURE_WEBHOOK_TOKEN: z.string().optional(),
  SCREENING_APPROVE_SCORE_MIN: z.coerce.number().int().optional(),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENV: z.enum(['sandbox', 'production']).optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

/** Parseia `source` (default: process.env) e lança erro tipado em caso de invalidez. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
