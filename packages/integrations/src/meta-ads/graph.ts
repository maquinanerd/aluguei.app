import { z } from 'zod';
import type {
  IMetaAdsProvider,
  MetaAdSetInput,
  MetaAssetInfo,
  MetaCampaignInput,
  MetaConnectionTestResult,
  MetaCreativeInput,
} from './types.js';

/**
 * Adapter real da Meta Marketing API (Graph API REST + fetch nativo, sem SDK).
 *
 * Documentação oficial consultada (2026-05-10/2026-07-15, via Wayback Machine —
 * o site ao vivo bloqueia acesso automatizado; ver docs/integrations/META_ADS_HOMOLOGATION.md):
 * - Marketing API overview/versioning: versão atual v25.0; URL versionada
 *   `https://graph.facebook.com/v25.0/...`; chamadas sem versão falham.
 * - Ad Account / Campaigns: POST /act_{id}/campaigns (name, objective, status
 *   somente ACTIVE|PAUSED na criação, special_ad_categories, daily|lifetime_budget,
 *   start_time, stop_time; budgets em unidade monetária menor — centavos).
 * - Ad Set: POST /act_{id}/adsets (campaign_id, targeting, optimization_goal,
 *   billing_event, status PAUSED, daily|lifetime_budget, promoted_object.page_id).
 *   Orçamento é OU no campaign OU no ad set, nunca ambos.
 * - AdCreative: POST /act_{id}/adcreatives (object_story_spec com page_id e
 *   link_data{link, message, image_hash, call_to_action}); conteúdo é IMUTÁVEL
 *   depois de criado (update aceita apenas name/status/adlabels).
 * - Ad: POST /act_{id}/ads (adset_id, creative{creative_id}, status PAUSED
 *   recomendado para evitar gasto acidental).
 * - Insights: GET /{campaign_id}/insights (fields spend, impressions, reach,
 *   clicks, ctr, cpc, cpm, frequency, inline_link_clicks, actions,
 *   cost_per_action_type; time_range; valores numéricos vêm como strings;
 *   spend em centavos da moeda da conta).
 * - Special Ad Categories: toda criação de campanha exige special_ad_categories
 *   (HOUSING para imóveis); ao selecionar categoria deve-se informar
 *   special_ad_category_country (default: país fiscal); restrições de targeting
 *   Housing (sem gênero, idade fixa, sem custom/lookalike audiences, geo mínimo).
 *
 * Suposições sinalizadas (não confirmadas na doc consultada nesta sessão):
 * - `promoted_object.page_id` no ad set é usado quando `defaultPageId` existe.
 * - CTA do link ad fixado em LEARN_MORE.
 * - `optimization_goal`/`billing_event` default LINK_CLICKS (objetivo
 *   OUTCOME_TRAFFIC do pipeline); configuravel por opções.
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem app + ad account + token de homologação,
 * nenhuma chamada foi validada contra a API live (ver docs/integrations/META_ADS_HOMOLOGATION.md).
 * Em produção, o registry ainda não ativa este adapter (ver registry.ts).
 */

export const META_GRAPH_API_VERSION = 'v25.0';
export const META_GRAPH_API_BASE_URL = 'https://graph.facebook.com';

export type MetaAdsProviderErrorKind =
  | 'RATE_LIMIT'
  | 'INVALID_TOKEN'
  | 'PERMISSION_DENIED'
  | 'DEVELOPMENT_ACCESS'
  | 'BAD_REQUEST'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'PROVIDER'
  | 'CREATIVE_IMMUTABLE'
  | 'MISSING_IMAGE_HASH'
  | 'MISSING_PAGE_ID';

/** Erro tipado do adapter Meta Graph API (nunca contém o token). */
export class MetaAdsProviderError extends Error {
  readonly kind: MetaAdsProviderErrorKind;
  readonly httpStatus?: number;
  readonly graphErrorCode?: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(opts: {
    kind: MetaAdsProviderErrorKind;
    message: string;
    httpStatus?: number;
    graphErrorCode?: number;
    retryable?: boolean;
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'MetaAdsProviderError';
    this.kind = opts.kind;
    if (opts.httpStatus !== undefined) {
      this.httpStatus = opts.httpStatus;
    }
    if (opts.graphErrorCode !== undefined) {
      this.graphErrorCode = opts.graphErrorCode;
    }
    this.retryable = opts.retryable ?? false;
    if (opts.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = opts.retryAfterSeconds;
    }
    if (opts.cause !== undefined) {
      this.cause = opts.cause;
    }
  }
}

export interface MetaGraphAdsProviderOptions {
  accessToken: string;
  /** ID do ad account (com ou sem prefixo `act_`). */
  adAccountId: string;
  /** Versão da Graph API (default: v25.0 — versão atual documentada em 2026-05). */
  apiVersion?: string;
  /** Base URL para testes (default: https://graph.facebook.com). */
  graphBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  /** page_id usado em object_story_spec (obrigatório para criar creative em live). */
  defaultPageId?: string;
  /** Países da Special Ad Category (ex.: ['BR']); default: omitido (Meta usa país fiscal). */
  specialAdCategoryCountries?: string[];
  /** Otimização do ad set (default LINK_CLICKS — alinhar ao objetivo da campanha). */
  defaultOptimizationGoal?: string;
  /** Evento de cobrança do ad set (default LINK_CLICKS). */
  defaultBillingEvent?: string;
  /**
   * Resolve mediaRefs locais → image_hash da Meta (upload via POST /act_{id}/adimages).
   * O pipeline hoje envia IDs locais de mídia (property_media), que NÃO são
   * image_hash da Meta — sem este resolver o adapter recusa com MISSING_IMAGE_HASH.
   */
  resolveImageHash?: (
    mediaRef: string,
  ) => Promise<string | null | undefined> | string | null | undefined;
}

const graphErrorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    error_user_msg: z.string().optional(),
    error_subcode: z.number().optional(),
    type: z.string().optional(),
  }),
});

const adAccountsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      account_status: z.string().optional(),
      currency: z.string().optional(),
      timezone_name: z.string().optional(),
    }),
  ),
});

const adAccountNodeSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  account_status: z.string().optional(),
});

const pagesSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      instagram_business_account: z
        .object({ id: z.string(), username: z.string().optional() })
        .optional(),
    }),
  ),
});

const businessesSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string().optional() })),
});

const createdObjectSchema = z.object({ id: z.string() });

const insightsRowSchema = z.object({
  date_start: z.string().optional(),
  date_stop: z.string().optional(),
  spend: z.string().optional(),
  impressions: z.string().optional(),
  reach: z.string().optional(),
  clicks: z.string().optional(),
  ctr: z.string().optional(),
  cpc: z.string().optional(),
  cpm: z.string().optional(),
  frequency: z.string().optional(),
  inline_link_clicks: z.string().optional(),
  actions: z.array(z.object({ action_type: z.string(), value: z.string() })).optional(),
  cost_per_action_type: z
    .array(z.object({ action_type: z.string(), value: z.string() }))
    .optional(),
});

const insightsResponseSchema = z.object({ data: z.array(insightsRowSchema) });

/** Códigos de erro Graph API documentados como rate limit (referências das páginas oficiais). */
const RATE_LIMIT_ERROR_CODES = new Set([4, 17, 32, 613, 80004]);
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (raw === null) {
    return undefined;
  }
  const seconds = Number.parseInt(raw, 10);
  if (Number.isNaN(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds;
}

function parseGraphError(
  payload: unknown,
): { code?: number; message?: string; errorUserMsg?: string } | undefined {
  const parsed = graphErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return undefined;
  }
  const error = parsed.data.error;
  return {
    ...(error.code !== undefined ? { code: error.code } : {}),
    ...(error.message !== undefined ? { message: error.message } : {}),
    ...(error.error_user_msg !== undefined ? { errorUserMsg: error.error_user_msg } : {}),
  };
}

/**
 * Adapter Meta Marketing API via Graph API REST.
 * Todas as criações usam status PAUSED (nunca ACTIVE direto); ativação só por
 * setCampaignStatus com intenção explícita do produto (ADR-029).
 */
export class MetaGraphAdsProvider implements IMetaAdsProvider {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly defaultPageId: string | undefined;
  private readonly specialAdCategoryCountries: string[];
  private readonly defaultOptimizationGoal: string;
  private readonly defaultBillingEvent: string;
  private readonly resolveImageHash:
    | ((mediaRef: string) => Promise<string | null | undefined> | string | null | undefined)
    | undefined;

  /** Orçamento informado na criação da campanha (para não duplicar no ad set). */
  private readonly campaignBudgetKinds = new Map<string, 'DAILY' | 'LIFETIME' | 'NONE'>();

  constructor(opts: MetaGraphAdsProviderOptions) {
    if (!opts.accessToken) {
      throw new MetaAdsProviderError({
        kind: 'INVALID_TOKEN',
        message: 'MetaGraphAdsProvider: accessToken ausente',
      });
    }
    if (!opts.adAccountId) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message: 'MetaGraphAdsProvider: adAccountId ausente',
      });
    }
    this.accessToken = opts.accessToken;
    this.adAccountId = opts.adAccountId.replace(/^act_/, '');
    this.apiVersion = opts.apiVersion ?? META_GRAPH_API_VERSION;
    this.baseUrl = (opts.graphBaseUrl ?? META_GRAPH_API_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.retryBaseDelayMs = opts.retryBaseDelayMs ?? 250;
    this.defaultPageId = opts.defaultPageId;
    this.specialAdCategoryCountries = opts.specialAdCategoryCountries ?? [];
    this.defaultOptimizationGoal = opts.defaultOptimizationGoal ?? 'LINK_CLICKS';
    this.defaultBillingEvent = opts.defaultBillingEvent ?? 'LINK_CLICKS';
    this.resolveImageHash = opts.resolveImageHash;
  }

  // ------------------------------------------------------------------
  // Helpers HTTP
  // ------------------------------------------------------------------

  private async request(
    path: string,
    init: {
      method?: 'GET' | 'POST';
      query?: Record<string, string>;
      body?: Record<string, string>;
    } = {},
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}${path}`);
    const query = init.query ?? {};
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      let attempt = 0;
      for (;;) {
        try {
          return await this.executeFetch(url.toString(), init, controller.signal);
        } catch (cause) {
          if (
            !(cause instanceof MetaAdsProviderError) ||
            !cause.retryable ||
            attempt >= this.maxRetries
          ) {
            throw cause;
          }
          const retryAfterMs =
            cause.retryAfterSeconds !== undefined ? cause.retryAfterSeconds * 1000 : undefined;
          const backoffMs = this.retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 50);
          attempt += 1;
          await sleep(retryAfterMs ?? backoffMs);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async executeFetch(
    url: string,
    init: { method?: 'GET' | 'POST'; body?: Record<string, string> },
    signal: AbortSignal,
  ): Promise<unknown> {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.accessToken}`,
        accept: 'application/json',
      };
      const body = init.body;
      if (body) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
      }
      response = await this.fetchImpl(url, {
        method: init.method ?? 'GET',
        headers,
        ...(body ? { body: new URLSearchParams(body) } : {}),
        signal,
      });
    } catch (cause) {
      if (isAbortError(cause)) {
        throw new MetaAdsProviderError({
          kind: 'TIMEOUT',
          message: `Timeout após ${String(this.timeoutMs)}ms na Graph API Meta`,
        });
      }
      throw new MetaAdsProviderError({
        kind: 'NETWORK',
        message: 'Falha de rede ao chamar a Graph API Meta',
        cause,
      });
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = null;
      }
    }
    const graphError = parseGraphError(payload);
    if (!response.ok) {
      throw this.classifyError(response.status, graphError, response.headers);
    }
    if (graphError) {
      throw this.classifyError(response.status, graphError, response.headers);
    }
    return payload;
  }

  private classifyError(
    httpStatus: number,
    graphError: { code?: number; message?: string; errorUserMsg?: string } | undefined,
    headers: Headers,
  ): MetaAdsProviderError {
    const code = graphError?.code;
    const fallbackMessage =
      graphError?.message ?? graphError?.errorUserMsg ?? `Graph API HTTP ${String(httpStatus)}`;
    const retryAfterSeconds = parseRetryAfter(headers);

    const build = (
      kind: MetaAdsProviderErrorKind,
      message: string,
      retryable = false,
    ): MetaAdsProviderError =>
      new MetaAdsProviderError({
        kind,
        message,
        httpStatus,
        retryable,
        ...(code !== undefined ? { graphErrorCode: code } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      });

    if (code === 190) {
      return build(
        'INVALID_TOKEN',
        fallbackMessage || 'Token de acesso Meta inválido ou expirado (código 190)',
      );
    }
    if (code === 200) {
      return build(
        'PERMISSION_DENIED',
        fallbackMessage ||
          'Permissão insuficiente (são necessárias ads_read/ads_management — código 200)',
      );
    }
    if (code === 270) {
      return build(
        'DEVELOPMENT_ACCESS',
        fallbackMessage ||
          'App em nível de acesso de desenvolvimento — solicite acesso avançado (código 270)',
      );
    }
    if (code !== undefined && RATE_LIMIT_ERROR_CODES.has(code)) {
      return build('RATE_LIMIT', fallbackMessage || 'Rate limit da Graph API', true);
    }
    if (httpStatus === 429) {
      return build('RATE_LIMIT', fallbackMessage || 'Rate limit da Graph API (HTTP 429)', true);
    }
    if (RETRYABLE_HTTP_STATUS.has(httpStatus)) {
      return build(
        'PROVIDER',
        fallbackMessage || `Erro de servidor da Graph API (HTTP ${String(httpStatus)})`,
        true,
      );
    }
    return build(
      'BAD_REQUEST',
      fallbackMessage || `Erro da Graph API (HTTP ${String(httpStatus)})`,
    );
  }

  private assertOkResponse(payload: unknown, schema: z.ZodType): void {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message: `Resposta inesperada da Graph API: ${parsed.error.message}`,
      });
    }
  }

  private toGraphDateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    const pad = (n: number): string => String(n).padStart(2, '0');
    return (
      `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
      `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+0000`
    );
  }

  /**
   * Traduz `targeting.geos` (formato do pipeline: registros livres) para
   * `geo_locations` da Graph API. Suposição: cada geo é {country} | {countries}
   * | {key, type:'country'} | objeto geo_locations completo; outros formatos
   * são repassados como estão e precisam de confirmação na homologação.
   */
  private buildTargeting(targeting: Record<string, unknown>): Record<string, unknown> {
    const geos = Array.isArray(targeting['geos']) ? (targeting['geos'] as unknown[]) : [];
    if (geos.length === 0) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message:
          'targeting sem geos resolvíveis — campanha Housing exige geo_locations (pipeline deve enviar geos)',
      });
    }
    const countries: string[] = [];
    const passthrough: Record<string, unknown> = {};
    for (const geo of geos) {
      if (!geo || typeof geo !== 'object') {
        continue;
      }
      const record = geo as Record<string, unknown>;
      if (record['geo_locations'] !== undefined) {
        const nested = record['geo_locations'];
        if (nested && typeof nested === 'object') {
          Object.assign(passthrough, nested as Record<string, unknown>);
          continue;
        }
      }
      const countriesValue = record['countries'];
      if (Array.isArray(countriesValue)) {
        for (const country of countriesValue) {
          if (typeof country === 'string') {
            countries.push(country);
          }
        }
        continue;
      }
      const countryValue = record['country'];
      if (typeof countryValue === 'string') {
        countries.push(countryValue);
        continue;
      }
      const keyValue = record['key'];
      if (typeof keyValue === 'string' && record['type'] === 'country') {
        countries.push(keyValue);
        continue;
      }
      Object.assign(passthrough, record);
    }
    const geoLocations: Record<string, unknown> = { ...passthrough };
    if (countries.length > 0) {
      geoLocations['countries'] = countries;
    }
    if (Object.keys(geoLocations).length === 0) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message: 'targeting sem geos reconhecíveis — confirme o formato no pipeline',
      });
    }
    return { geo_locations: geoLocations };
  }

  private async resolveMediaHashes(mediaRefs: string[]): Promise<string[]> {
    const resolve = this.resolveImageHash;
    if (!resolve) {
      throw new MetaAdsProviderError({
        kind: 'MISSING_IMAGE_HASH',
        message:
          'resolveImageHash ausente — mediaRefs locais (property_media) não são image_hash da Meta; ' +
          'configure o resolver que sobe as imagens (POST /act_{id}/adimages) e devolve os hashes',
      });
    }
    const hashes: string[] = [];
    for (const ref of mediaRefs) {
      const hash = await resolve(ref);
      if (!hash) {
        throw new MetaAdsProviderError({
          kind: 'MISSING_IMAGE_HASH',
          message: `Sem image_hash para mediaRef ${ref} — a mídia precisa ser pública e aprovada`,
        });
      }
      hashes.push(hash);
    }
    return hashes;
  }

  // ------------------------------------------------------------------
  // IMetaAdsProvider
  // ------------------------------------------------------------------

  async testConnection(): Promise<MetaConnectionTestResult> {
    try {
      const mePayload = await this.request('/me/adaccounts', {
        query: { fields: 'id,name' },
      });
      this.assertOkResponse(mePayload, adAccountsSchema);
      const me = adAccountsSchema.parse(mePayload);

      const accountPayload = await this.request(`/act_${this.adAccountId}`, {
        query: { fields: 'id,name,account_status' },
      });
      this.assertOkResponse(accountPayload, adAccountNodeSchema);
      const account = adAccountNodeSchema.parse(accountPayload);

      return {
        ok: true,
        providerUserId: me.data[0]?.id ?? account.id,
        scopes: ['ads_management', 'ads_read'],
      };
    } catch (cause) {
      if (
        cause instanceof MetaAdsProviderError &&
        (cause.kind === 'INVALID_TOKEN' ||
          cause.kind === 'PERMISSION_DENIED' ||
          cause.kind === 'DEVELOPMENT_ACCESS')
      ) {
        return { ok: false, error: cause.message };
      }
      throw cause;
    }
  }

  async listAssets(): Promise<MetaAssetInfo[]> {
    const [adAccounts, pages, instagram, businesses] = await Promise.all([
      this.fetchAdAccountAssets(),
      this.fetchPageAssets(),
      this.fetchInstagramAssets(),
      this.fetchBusinessAssets(),
    ]);
    return [...adAccounts, ...pages, ...instagram, ...businesses];
  }

  private async fetchAdAccountAssets(): Promise<MetaAssetInfo[]> {
    try {
      const payload = await this.request('/me/adaccounts', {
        query: { fields: 'id,name,account_status,currency,timezone_name' },
      });
      this.assertOkResponse(payload, adAccountsSchema);
      const parsed = adAccountsSchema.parse(payload);
      return parsed.data.map((account) => ({
        kind: 'AD_ACCOUNT' as const,
        providerAssetId: account.id,
        name: account.name ?? account.id,
        status: account.account_status ?? 'UNKNOWN',
        metadata: { currency: account.currency, timezone: account.timezone_name },
      }));
    } catch {
      return []; // edge opcional: sem permissão (ex.: ads_read ausente) não derruba a listagem
    }
  }

  private async fetchPageAssets(): Promise<MetaAssetInfo[]> {
    try {
      const payload = await this.request('/me/accounts', {
        query: { fields: 'id,name' },
      });
      this.assertOkResponse(payload, pagesSchema);
      const parsed = pagesSchema.parse(payload);
      return parsed.data.map((page) => ({
        kind: 'PAGE' as const,
        providerAssetId: page.id,
        name: page.name ?? page.id,
        status: 'ACTIVE',
      }));
    } catch {
      return [];
    }
  }

  private async fetchInstagramAssets(): Promise<MetaAssetInfo[]> {
    try {
      const payload = await this.request('/me/accounts', {
        query: { fields: 'id,name,instagram_business_account{id,username}' },
      });
      this.assertOkResponse(payload, pagesSchema);
      const parsed = pagesSchema.parse(payload);
      const assets: MetaAssetInfo[] = [];
      for (const page of parsed.data) {
        const instagram = page.instagram_business_account;
        if (instagram) {
          assets.push({
            kind: 'INSTAGRAM_ACCOUNT',
            providerAssetId: instagram.id,
            name: instagram.username ?? instagram.id,
            status: 'ACTIVE',
          });
        }
      }
      return assets;
    } catch {
      return [];
    }
  }

  private async fetchBusinessAssets(): Promise<MetaAssetInfo[]> {
    try {
      const payload = await this.request('/me/businesses', {
        query: { fields: 'id,name' },
      });
      this.assertOkResponse(payload, businessesSchema);
      const parsed = businessesSchema.parse(payload);
      return parsed.data.map((business) => ({
        kind: 'BUSINESS' as const,
        providerAssetId: business.id,
        name: business.name ?? business.id,
        status: 'ACTIVE',
      }));
    } catch {
      return [];
    }
  }

  async createCampaign(input: MetaCampaignInput): Promise<{ providerCampaignId: string }> {
    if (input.specialAdCategories.length === 0) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message: 'special_ad_categories é obrigatório (HOUSING para imóveis)',
      });
    }
    const hasDaily = input.dailyBudgetCents !== undefined && input.dailyBudgetCents !== null;
    const hasLifetime =
      input.lifetimeBudgetCents !== undefined && input.lifetimeBudgetCents !== null;
    if (hasDaily && hasLifetime) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message: 'Informe exatamente um orçamento: daily OU lifetime (XOR)',
      });
    }
    const budgetKind: 'DAILY' | 'LIFETIME' | 'NONE' = hasDaily
      ? 'DAILY'
      : hasLifetime
        ? 'LIFETIME'
        : 'NONE';

    const body: Record<string, string> = {
      name: input.name,
      objective: input.objective,
      status: 'PAUSED', // NUNCA ACTIVE direto: criação sempre PAUSED (docs: só ACTIVE/PAUSED na criação)
      special_ad_categories: JSON.stringify(input.specialAdCategories),
      buying_type: 'AUCTION',
    };
    if (this.specialAdCategoryCountries.length > 0) {
      body['special_ad_category_country'] = JSON.stringify(this.specialAdCategoryCountries);
    }
    if (hasDaily) {
      body['daily_budget'] = String(input.dailyBudgetCents);
    }
    if (hasLifetime) {
      body['lifetime_budget'] = String(input.lifetimeBudgetCents);
    }
    if (input.startAt) {
      body['start_time'] = this.toGraphDateTime(input.startAt);
    }
    if (input.endAt) {
      body['stop_time'] = this.toGraphDateTime(input.endAt);
    }

    const payload = await this.request(`/act_${this.adAccountId}/campaigns`, {
      method: 'POST',
      body,
    });
    this.assertOkResponse(payload, createdObjectSchema);
    const created = createdObjectSchema.parse(payload);
    this.campaignBudgetKinds.set(created.id, budgetKind);
    return { providerCampaignId: created.id };
  }

  async createAdSet(
    providerCampaignId: string,
    input: MetaAdSetInput,
  ): Promise<{ providerAdsetId: string }> {
    const body: Record<string, string> = {
      name: input.name,
      campaign_id: providerCampaignId,
      status: 'PAUSED',
      optimization_goal: this.defaultOptimizationGoal,
      billing_event: this.defaultBillingEvent,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(this.buildTargeting(input.targeting)),
    };
    if (this.defaultPageId) {
      body['promoted_object'] = JSON.stringify({ page_id: this.defaultPageId });
    }
    // Orçamento no ad set SOMENTE quando a campanha não tem orçamento próprio
    // (docs: "You can either set budget at the campaign level or at the adset level, not both").
    const campaignBudgetKind = this.campaignBudgetKinds.get(providerCampaignId) ?? 'NONE';
    if (campaignBudgetKind === 'NONE') {
      body['daily_budget'] = String(input.budgetCents);
    }
    if (input.startAt) {
      body['start_time'] = this.toGraphDateTime(input.startAt);
    }
    if (input.endAt) {
      body['end_time'] = this.toGraphDateTime(input.endAt);
    }

    const payload = await this.request(`/act_${this.adAccountId}/adsets`, {
      method: 'POST',
      body,
    });
    this.assertOkResponse(payload, createdObjectSchema);
    const created = createdObjectSchema.parse(payload);
    return { providerAdsetId: created.id };
  }

  async createCreative(input: MetaCreativeInput): Promise<{ providerCreativeId: string }> {
    const pageId = this.defaultPageId;
    if (!pageId) {
      throw new MetaAdsProviderError({
        kind: 'MISSING_PAGE_ID',
        message:
          'defaultPageId ausente — object_story_spec exige page_id (pipeline deve informar o asset Page do perfil)',
      });
    }
    const hashes = await this.resolveMediaHashes(input.mediaRefs);
    const firstHash = hashes[0];
    if (!firstHash) {
      throw new MetaAdsProviderError({
        kind: 'MISSING_IMAGE_HASH',
        message: 'Nenhum image_hash resolvido para o creative',
      });
    }
    // MVP: link ad com a primeira imagem. Múltiplas imagens (carousel via
    // link_data.child_attachments) é decisão de produto — ver homologação.
    const linkData: Record<string, unknown> = {
      link: input.landingUrl,
      message: input.copyPrimary,
      image_hash: firstHash,
      call_to_action: { type: 'LEARN_MORE', value: { link: input.landingUrl } },
    };
    const body: Record<string, string> = {
      name: input.name,
      object_story_spec: JSON.stringify({ page_id: pageId, link_data: linkData }),
    };

    const payload = await this.request(`/act_${this.adAccountId}/adcreatives`, {
      method: 'POST',
      body,
    });
    this.assertOkResponse(payload, createdObjectSchema);
    const created = createdObjectSchema.parse(payload);
    return { providerCreativeId: created.id };
  }

  async createAd(
    providerAdsetId: string,
    providerCreativeId: string,
  ): Promise<{ providerAdId: string }> {
    const body: Record<string, string> = {
      name: `Ad ${providerAdsetId}`,
      adset_id: providerAdsetId,
      creative: JSON.stringify({ creative_id: providerCreativeId }),
      status: 'PAUSED', // docs recomendam PAUSED durante testes para evitar gasto acidental
    };
    const payload = await this.request(`/act_${this.adAccountId}/ads`, {
      method: 'POST',
      body,
    });
    this.assertOkResponse(payload, createdObjectSchema);
    const created = createdObjectSchema.parse(payload);
    return { providerAdId: created.id };
  }

  async setCampaignStatus(providerCampaignId: string, status: 'PAUSED' | 'ACTIVE'): Promise<void> {
    // Ativação apenas por intenção explícita de runtime (ADR-029).
    await this.request(`/${providerCampaignId}`, {
      method: 'POST',
      body: { status },
    });
  }

  async updateCampaignBudget(
    providerCampaignId: string,
    budget: { dailyBudgetCents?: number | null; lifetimeBudgetCents?: number | null },
  ): Promise<void> {
    const hasDaily = budget.dailyBudgetCents !== undefined && budget.dailyBudgetCents !== null;
    const hasLifetime =
      budget.lifetimeBudgetCents !== undefined && budget.lifetimeBudgetCents !== null;
    if (hasDaily === hasLifetime) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message: 'Informe exatamente um orçamento: daily OU lifetime (XOR)',
      });
    }
    const body: Record<string, string> = hasDaily
      ? { daily_budget: String(budget.dailyBudgetCents) }
      : { lifetime_budget: String(budget.lifetimeBudgetCents) };
    await this.request(`/${providerCampaignId}`, { method: 'POST', body });
  }

  async updateSchedule(
    providerCampaignId: string,
    schedule: { startAt?: string | null; endAt?: string | null },
  ): Promise<void> {
    const body: Record<string, string> = {};
    if (schedule.startAt) {
      body['start_time'] = this.toGraphDateTime(schedule.startAt);
    }
    if (schedule.endAt) {
      body['stop_time'] = this.toGraphDateTime(schedule.endAt);
    }
    if (Object.keys(body).length === 0) {
      throw new MetaAdsProviderError({
        kind: 'BAD_REQUEST',
        message: 'Agendamento vazio — informe startAt e/ou endAt',
      });
    }
    await this.request(`/${providerCampaignId}`, { method: 'POST', body });
  }

  updateCreative(
    _providerCreativeId: string,
    _input: Pick<MetaCreativeInput, 'mediaRefs' | 'copyPrimary' | 'landingUrl'>,
  ): Promise<void> {
    // Conteúdo do AdCreative é IMUTÁVEL na Graph API (docs: update aceita apenas
    // name/status/adlabels). Trocar mídia/copy exige novo creative + re-apontar o ad:
    //   POST /act_{id}/adcreatives  → novo creative
    //   POST /{ad_id}               → creative={creative_id: novo}
    // O pipeline (UPDATE_CREATIVE em meta_sync_jobs + meta_creative_links) precisa
    // deste ajuste antes do modo live — ver docs/integrations/META_ADS_HOMOLOGATION.md.
    return Promise.reject(
      new MetaAdsProviderError({
        kind: 'CREATIVE_IMMUTABLE',
        message:
          'A Graph API não permite editar o conteúdo de um AdCreative (apenas name/status/adlabels). ' +
          'Para atualizar mídia/copy/landing é necessário criar um novo creative e re-apontar o anúncio; ' +
          'o pipeline de UPDATE_CREATIVE precisa de ajuste antes do modo live.',
      }),
    );
  }

  async archiveCampaign(providerCampaignId: string): Promise<void> {
    await this.request(`/${providerCampaignId}`, {
      method: 'POST',
      body: { status: 'ARCHIVED' },
    });
  }

  async getInsights(
    providerCampaignId: string,
    range: { dateStart: string; dateEnd: string },
  ): Promise<Record<string, unknown>> {
    const fields =
      'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,inline_link_clicks,actions,cost_per_action_type,date_start,date_stop';
    const payload = await this.request(`/${providerCampaignId}/insights`, {
      query: {
        fields,
        time_range: JSON.stringify({ since: range.dateStart, until: range.dateEnd }),
        limit: '1',
      },
    });
    this.assertOkResponse(payload, insightsResponseSchema);
    const parsed = insightsResponseSchema.parse(payload);
    const row = parsed.data[0];
    const insights: Record<string, unknown> = {};
    if (!row) {
      return insights; // sem dados no período → objeto vazio (diferente do fake, que sempre retorna métricas)
    }
    const parseIntSafe = (value: string | undefined): number | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const n = Number.parseInt(value, 10);
      return Number.isNaN(n) ? undefined : n;
    };
    const parseFloatSafe = (value: string | undefined): number | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const n = Number.parseFloat(value);
      return Number.isNaN(n) ? undefined : n;
    };

    const spendCents = parseIntSafe(row.spend);
    const impressions = parseIntSafe(row.impressions);
    const reach = parseIntSafe(row.reach);
    const clicks = parseIntSafe(row.clicks);
    const linkClicks = parseIntSafe(row.inline_link_clicks);
    const ctr = parseFloatSafe(row.ctr);
    const cpcCents = parseIntSafe(row.cpc);
    const cpmCents = parseIntSafe(row.cpm);
    const frequency = parseFloatSafe(row.frequency);

    if (spendCents !== undefined) {
      insights['spendCents'] = spendCents;
    }
    if (impressions !== undefined) {
      insights['impressions'] = impressions;
    }
    if (reach !== undefined) {
      insights['reach'] = reach;
    }
    if (clicks !== undefined) {
      insights['clicks'] = clicks;
    }
    if (linkClicks !== undefined) {
      insights['linkClicks'] = linkClicks;
    }
    if (ctr !== undefined) {
      insights['ctr'] = ctr;
    }
    if (cpcCents !== undefined) {
      insights['cpcCents'] = cpcCents;
    }
    if (cpmCents !== undefined) {
      insights['cpmCents'] = cpmCents;
    }
    if (frequency !== undefined) {
      insights['frequency'] = frequency;
    }

    const leadAction = row.actions?.find((action) => action.action_type === 'lead');
    const leadValue = leadAction ? parseIntSafe(leadAction.value) : undefined;
    if (leadValue !== undefined) {
      insights['leads'] = leadValue;
    }
    const leadCost = row.cost_per_action_type?.find((cost) => cost.action_type === 'lead');
    const leadCostValue = leadCost ? parseIntSafe(leadCost.value) : undefined;
    if (leadCostValue !== undefined) {
      insights['costPerLeadCents'] = leadCostValue;
    }

    return insights;
  }
}
