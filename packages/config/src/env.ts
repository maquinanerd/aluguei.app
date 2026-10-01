import { z } from 'zod';

const emptyAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

/**
 * Opção de configuração em que **valor vazio vale como ausente**.
 *
 * Orquestrador repassa variável não preenchida como string vazia, e o Coolify
 * injeta as variáveis do compose em todos os serviços do arquivo — um
 * `${VAR:-}` declarado para um serviço chega vazio nos outros. Sem isto a API
 * recusa a subida com "expected one of ..." e o contêiner entra em laço de
 * reinício, que foi o que derrubou a homologação em 2026-09-24.
 */
function opcaoOpcional<const T extends readonly [string, ...string[]]>(valores: T) {
  return z.preprocess(emptyAsUndefined, z.enum(valores).optional());
}

/**
 * Schema de configuração da aplicação. Nunca contenha segredos em valores default.
 *
 * O default `development` de NODE_ENV vale só para uso como biblioteca e em testes
 * (`envSchema.parse`, `loadEnv`). API e worker sobem por `loadRuntimeEnv` (runtime.ts), que
 * exige NODE_ENV explícito e, em produção, valida banco, URLs, segredos e providers.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Permissão explícita para providers FAKE, mock ou dry_run em produção (homologação).
   * Só o valor exato `true` vale; sem ela, a API e o worker recusam a subida.
   */
  ALLOW_FAKE_PROVIDERS: opcaoOpcional(['true', 'false']),
  /**
   * Oferece o "Canal de teste" (`fake`) como canal de publicação. Separado de
   * `ALLOW_FAKE_PROVIDERS` de propósito: a homologação precisa de pagamento e assinatura em
   * modo de teste, mas a imobiliária não deve ver um canal que não publica em lugar nenhum.
   * Só o valor exato `true` vale — desenvolvimento, testes e E2E.
   */
  ALLOW_FAKE_CHANNEL: opcaoOpcional(['true', 'false']),
  LOG_LEVEL: z.string().default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().default(4000),
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000), // 30 dias
  COOKIE_SECURE: opcaoOpcional(['true', 'false']),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  // MinIO e outros S3 atrás de domínio próprio: bucket no caminho, não no host.
  STORAGE_FORCE_PATH_STYLE: opcaoOpcional(['true', 'false']),
  /**
   * `disk`: objetos numa pasta local, com URLs assinadas pela própria API (`/dev/storage/object`).
   * Só para a stack de testes (F3, ADR-105): fora de produção e com ALLOW_FAKE_PROVIDERS=true.
   */
  STORAGE_DRIVER: opcaoOpcional(['s3', 'disk']),
  STORAGE_DISK_ROOT: z.preprocess(emptyAsUndefined, z.string().optional()),
  /** Endereço da API visto pelo navegador, base das URLs assinadas do storage em disco. */
  STORAGE_DISK_PUBLIC_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  // Cadastro por áudio (ADR-104): só `ZERO` liga o recurso. Qualquer outro
  // valor — inclusive vazio — mantém desligado, que é a falha fechada.
  AI_AUDIO_RETENTION: z.string().optional(),
  AI_AUDIO_PROVIDER: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  META_MODE: opcaoOpcional(['dry_run', 'live']),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().optional(),
  META_OAUTH_REDIRECT_URI: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  MCP_ALLOWED_ORG_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  SERASA_CLIENT_ID: z.string().optional(),
  SERASA_CLIENT_SECRET: z.string().optional(),
  SPC_CLIENT_ID: z.string().optional(),
  SPC_CLIENT_SECRET: z.string().optional(),
  CLICKSIGN_API_TOKEN: z.string().optional(),
  D4SIGN_API_TOKEN: z.string().optional(),
  SIGNATURE_PROVIDER: opcaoOpcional(['FAKE', 'CLICKSIGN', 'D4SIGN']),
  SIGNATURE_WEBHOOK_TOKEN: z.string().optional(),
  SCREENING_APPROVE_SCORE_MIN: z.coerce.number().int().optional(),
  SCREENING_PROVIDER: opcaoOpcional(['FAKE', 'SERASA', 'SPC']),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENV: opcaoOpcional(['sandbox', 'production']),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  PAYMENT_PROVIDER: opcaoOpcional(['FAKE', 'ASAAS']),
  /**
   * Quem entrega a caixa de saída de e-mail (B28, D6 b). Sem valor, nada sai e a mensagem fica na
   * caixa de saída, como antes. RESEND exige RESEND_API_KEY e EMAIL_FROM.
   */
  EMAIL_PROVIDER: opcaoOpcional(['RESEND', 'FAKE']),
  RESEND_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  /** Remetente verificado no provedor: "AchouImóvel <nao-responda@achouimovel.online>". */
  EMAIL_FROM: z.preprocess(emptyAsUndefined, z.string().optional()),
  META_ACCESS_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  // Worker. Vazio vale como ausente (z.coerce leria "" como 0).
  /** Porta do health HTTP do worker (`GET /health`); ausente: sem servidor de health. */
  WORKER_HEALTH_PORT: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(0).max(65_535).optional(),
  ),
  /** Espera pelos jobs em andamento no SIGTERM/SIGINT; ausente: 20 s. */
  WORKER_SHUTDOWN_TIMEOUT_MS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  /**
   * Endereço público da própria API (https em produção), base das URLs que saem do sistema: o feed
   * do Grupo OLX e as fotos que o robô dele baixa (ADR-107). Separado de `API_BASE_URL`, que é o
   * endereço que o BFF usa e pode ser da rede interna. Ausente: o feed não é gerado.
   */
  API_PUBLIC_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  /**
   * Chave que o Grupo OLX entrega na homologação do software (Basic Auth `vivareal:<chave>`, uma
   * por software, não por imobiliária). Ausente: os webhooks de lead e de relatório respondem 503 —
   * nada entra sem autenticação (ADR-108).
   */
  GRUPO_OLX_LEADS_SECRET_KEY: z.preprocess(emptyAsUndefined, z.string().min(8).optional()),
  // Admins da plataforma (e-mails separados por vírgula). Ausente: ninguém é admin.
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
  // Web (Next.js): lidas por apps/web, que não depende deste pacote. Ficam no schema para o
  // `.env.example` e a documentação das variáveis estarem num lugar só (env-example.test.ts).
  /** URL da API usada pelo BFF; em produção, https (ou http interno com a permissão abaixo). */
  API_BASE_URL: z.string().optional(),
  /** Permite `API_BASE_URL` http em produção, só para endereço da rede interna (P1-15). */
  API_BASE_URL_ALLOW_HTTP: opcaoOpcional(['true', 'false']),
  /** Slug da imobiliária exibida na vitrine pública. */
  PUBLIC_ORG_SLUG: z.string().optional(),
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
