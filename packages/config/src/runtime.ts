import { envSchema } from './env.js';
import type { AppEnv } from './env.js';

/** Processos que sobem com `loadRuntimeEnv`: cada um exige só o que usa. */
export type RuntimeService = 'api' | 'worker';

/**
 * Configuração que impede a subida. A mensagem tem uma linha por problema e nunca repete o
 * valor de uma variável (a saída vai para o log do deploy).
 */
export class ConfigError extends Error {
  readonly service: RuntimeService;
  readonly problems: readonly string[];

  constructor(service: RuntimeService, nodeEnv: string | undefined, problems: string[]) {
    const where = nodeEnv === 'production' ? ' em produção' : '';
    const count = `${String(problems.length)} ${problems.length === 1 ? 'problema' : 'problemas'}`;
    super(
      [
        `Configuração inválida: ${service} não sobe${where} (${count}).`,
        ...problems.map((problem) => `  - ${problem}`),
      ].join('\n'),
    );
    this.name = 'ConfigError';
    this.service = service;
    this.problems = problems;
  }
}

const WEBHOOK_SECRETS: ReadonlyArray<[keyof AppEnv, string]> = [
  ['ASAAS_WEBHOOK_TOKEN', 'token do webhook de pagamentos (POST /webhooks/payments)'],
  ['SIGNATURE_WEBHOOK_TOKEN', 'token do webhook de assinatura (POST /webhooks/signature)'],
  ['META_APP_SECRET', 'segredo do app da Meta (assinatura dos webhooks do WhatsApp e da Meta)'],
  ['META_WEBHOOK_VERIFY_TOKEN', 'token de verificação do webhook do WhatsApp (GET)'],
];

/**
 * Providers FAKE, mock ou dry_run escolhidos para o serviço, na ordem em que aparecem na
 * mensagem de boot. Só conta o que o serviço usa (a API não roda screening; o worker não envia
 * envelope de assinatura).
 */
export function fakeProvidersInUse(env: AppEnv, service: RuntimeService): string[] {
  const fakes: string[] = [];
  if (env.PAYMENT_PROVIDER === 'FAKE') {
    fakes.push('PAYMENT_PROVIDER=FAKE');
  }
  if (service === 'api' && env.SIGNATURE_PROVIDER === 'FAKE') {
    fakes.push('SIGNATURE_PROVIDER=FAKE');
  }
  if (service === 'worker' && env.SCREENING_PROVIDER === 'FAKE') {
    fakes.push('SCREENING_PROVIDER=FAKE');
  }
  if (env.META_MODE === 'dry_run') {
    fakes.push('META_MODE=dry_run');
  }
  if (env.AI_PROVIDER === 'mock') {
    fakes.push('AI_PROVIDER=mock');
  }
  return fakes;
}

function productionProblems(
  env: AppEnv,
  source: NodeJS.ProcessEnv,
  service: RuntimeService,
): string[] {
  const problems: string[] = [];
  const missing = (name: string, why: string): void => {
    problems.push(`${name} ausente: ${why}`);
  };

  if (!env.DATABASE_URL) {
    missing('DATABASE_URL', 'URL do PostgreSQL');
  } else if (!/^postgres(ql)?:\/\//i.test(env.DATABASE_URL)) {
    problems.push('DATABASE_URL inválida: precisa começar com postgresql:// ou postgres://');
  }

  if (service === 'api') {
    if (!source.APP_BASE_URL) {
      missing('APP_BASE_URL', 'URL pública do web (https), usada no CORS e nos links');
    } else if (!env.APP_BASE_URL.startsWith('https://')) {
      problems.push('APP_BASE_URL precisa usar https em produção');
    }
    if (env.COOKIE_SECURE === 'false') {
      problems.push('COOKIE_SECURE=false não é aceito em produção: o cookie de sessão é Secure');
    }
    for (const [name, why] of WEBHOOK_SECRETS) {
      if (!env[name]) {
        missing(name, why);
      }
    }
    if (!env.META_TOKEN_ENCRYPTION_KEY) {
      missing('META_TOKEN_ENCRYPTION_KEY', 'chave que cifra os tokens de conexão da Meta');
    } else if (!/^[0-9a-fA-F]{64}$/.test(env.META_TOKEN_ENCRYPTION_KEY)) {
      problems.push('META_TOKEN_ENCRYPTION_KEY inválida: hex de 64 caracteres (32 bytes)');
    }
  }

  switch (env.PAYMENT_PROVIDER) {
    case undefined:
      missing('PAYMENT_PROVIDER', 'escolha ASAAS ou FAKE');
      break;
    case 'ASAAS':
      if (!env.ASAAS_API_KEY) {
        missing('ASAAS_API_KEY', 'obrigatória com PAYMENT_PROVIDER=ASAAS');
      }
      if (!env.ASAAS_ENV) {
        missing('ASAAS_ENV', 'defina sandbox ou production (sem ambiente padrão)');
      }
      break;
    case 'FAKE':
      break;
  }

  if (service === 'api') {
    switch (env.SIGNATURE_PROVIDER) {
      case undefined:
        missing('SIGNATURE_PROVIDER', 'escolha CLICKSIGN ou FAKE');
        break;
      case 'CLICKSIGN':
        if (!env.CLICKSIGN_API_TOKEN) {
          missing('CLICKSIGN_API_TOKEN', 'obrigatório com SIGNATURE_PROVIDER=CLICKSIGN');
        }
        break;
      case 'D4SIGN':
        problems.push('SIGNATURE_PROVIDER=D4SIGN não tem adapter: use CLICKSIGN ou FAKE');
        break;
      case 'FAKE':
        break;
    }
  }

  if (service === 'worker') {
    switch (env.SCREENING_PROVIDER) {
      case undefined:
        missing('SCREENING_PROVIDER', 'escolha SERASA ou FAKE');
        break;
      case 'SERASA':
        if (!env.SERASA_CLIENT_ID) {
          missing('SERASA_CLIENT_ID', 'obrigatório com SCREENING_PROVIDER=SERASA');
        }
        if (!env.SERASA_CLIENT_SECRET) {
          missing('SERASA_CLIENT_SECRET', 'obrigatório com SCREENING_PROVIDER=SERASA');
        }
        break;
      case 'SPC':
        problems.push('SCREENING_PROVIDER=SPC não tem adapter: use SERASA ou FAKE');
        break;
      case 'FAKE':
        break;
    }
  }

  switch (env.META_MODE) {
    case undefined:
      missing('META_MODE', 'defina live ou dry_run (WhatsApp e Meta Ads)');
      break;
    case 'live':
      if (!env.META_ACCESS_TOKEN) {
        missing('META_ACCESS_TOKEN', 'obrigatório com META_MODE=live (Meta Ads)');
      }
      if (!env.WHATSAPP_ACCESS_TOKEN) {
        missing('WHATSAPP_ACCESS_TOKEN', 'obrigatório com META_MODE=live (WhatsApp)');
      }
      if (!env.WHATSAPP_PHONE_NUMBER_ID) {
        missing('WHATSAPP_PHONE_NUMBER_ID', 'obrigatório com META_MODE=live (WhatsApp)');
      }
      break;
    case 'dry_run':
      break;
  }

  switch (env.AI_PROVIDER) {
    case undefined:
      missing('AI_PROVIDER', 'escolha openai, gemini ou mock');
      break;
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        missing('OPENAI_API_KEY', 'obrigatória com AI_PROVIDER=openai');
      }
      break;
    case 'gemini':
      if (!env.GEMINI_API_KEY) {
        missing('GEMINI_API_KEY', 'obrigatória com AI_PROVIDER=gemini');
      }
      break;
    case 'mock':
      break;
    default:
      problems.push('AI_PROVIDER inválido: use openai, gemini ou mock');
  }

  if (env.REDIS_URL && !/^rediss?:\/\//i.test(env.REDIS_URL)) {
    problems.push('REDIS_URL inválida: use redis:// ou rediss://');
  }
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT && !/^https?:\/\//i.test(env.OTEL_EXPORTER_OTLP_ENDPOINT)) {
    problems.push('OTEL_EXPORTER_OTLP_ENDPOINT inválido: URL http(s) do coletor OTLP');
  }

  const fakes = fakeProvidersInUse(env, service);
  if (fakes.length > 0 && env.ALLOW_FAKE_PROVIDERS !== 'true') {
    problems.push(
      `ALLOW_FAKE_PROVIDERS ausente: em produção, providers FAKE, mock ou dry_run só sobem com ALLOW_FAKE_PROVIDERS=true (em uso: ${fakes.join(', ')})`,
    );
  }
  return problems;
}

/**
 * Carrega a configuração de um processo (API ou worker) e recusa a subida com tudo o que falta.
 *
 * - NODE_ENV é obrigatório: não há ambiente padrão (um deploy sem NODE_ENV rodaria como
 *   desenvolvimento, com rotas de simulação e providers FAKE).
 * - Em produção: banco, URL do web, cookie Secure, segredos dos webhooks, chave dos tokens da
 *   Meta e escolha explícita de cada provider, com as credenciais dos reais. FAKE, mock e
 *   dry_run só com `ALLOW_FAKE_PROVIDERS=true`.
 */
export function loadRuntimeEnv(
  service: RuntimeService,
  source: NodeJS.ProcessEnv = process.env,
): AppEnv {
  if (!source.NODE_ENV?.trim()) {
    throw new ConfigError(service, undefined, [
      'NODE_ENV ausente: defina development, test ou production (não há ambiente padrão)',
    ]);
  }
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      service,
      source.NODE_ENV,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const problems = productionProblems(env, source, service);
    if (problems.length > 0) {
      throw new ConfigError(service, env.NODE_ENV, problems);
    }
  }
  return env;
}

/** Recorte do env usado pelas escolhas padrão fora de produção. */
export interface ModeSource {
  NODE_ENV?: string | undefined;
  META_MODE?: string | undefined;
  SCREENING_PROVIDER?: string | undefined;
}

/**
 * Modo da Meta (WhatsApp e Meta Ads): o configurado; fora de produção, `dry_run` quando
 * ausente. Em produção sem META_MODE não há modo — os registries devolvem "não configurado",
 * nunca o FAKE (e o boot já recusou essa configuração).
 */
export function resolveMetaMode(env: ModeSource): 'live' | 'dry_run' | undefined {
  if (env.META_MODE === 'live' || env.META_MODE === 'dry_run') {
    return env.META_MODE;
  }
  if (env.META_MODE === undefined && env.NODE_ENV !== 'production') {
    return 'dry_run';
  }
  return undefined;
}

/** Provider de screening: o configurado; FAKE só fora de produção e só quando ausente. */
export function resolveScreeningProvider(env: ModeSource): string | undefined {
  if (env.SCREENING_PROVIDER !== undefined) {
    return env.SCREENING_PROVIDER;
  }
  return env.NODE_ENV === 'production' ? undefined : 'FAKE';
}
