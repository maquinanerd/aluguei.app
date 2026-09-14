import { describe, expect, it, vi } from 'vitest';
import { MetaGraphAdsProvider, MetaAdsProviderError } from './graph.js';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function graphError(code: number, message: string): unknown {
  return { error: { code, message, type: 'OAuthException' } };
}

function makeProvider(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new MetaGraphAdsProvider({
    accessToken: 'EAAG-teste-somente',
    adAccountId: 'act_123456',
    fetchImpl,
    defaultPageId: 'page_1',
    resolveImageHash: (ref: string) => `hash_${ref}`,
    ...overrides,
  });
}

function postBody(init: RequestInit | undefined): URLSearchParams {
  return new URLSearchParams(init?.body as string);
}

describe('MetaGraphAdsProvider', () => {
  it('testConnection ok verifica /me/adaccounts e o ad account configurado', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { data: [{ id: 'act_123456', name: 'Conta Teste' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { id: 'act_123456', name: 'Conta Teste', account_status: 'ACTIVE' }),
      );
    const provider = makeProvider(fetchImpl);
    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
    expect(result.providerUserId).toBe('act_123456');
    expect(result.scopes).toEqual(['ads_management', 'ads_read']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const urls = (fetchImpl.mock.calls as Array<[string]>).map(([url]) => url);
    expect(urls[0]).toContain('/me/adaccounts');
    expect(urls[1]).toContain('/act_123456?');
  });

  it('testConnection auth-fail retorna ok:false com erro (token inválido)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, graphError(190, 'Invalid OAuth access token.')));
    const provider = makeProvider(fetchImpl);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('token');
    expect(result.error).not.toContain('EAAG'); // token nunca no erro
  });

  it('createCampaign envia special_ad_categories HOUSING e status PAUSED', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'cmp_1', success: true }));
    const provider = makeProvider(fetchImpl);
    const result = await provider.createCampaign({
      name: 'Campanha Teste',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 10_000,
      startAt: '2026-09-01T00:00:00.000Z',
    });
    expect(result.providerCampaignId).toBe('cmp_1');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/act_123456/campaigns');
    expect(init.method).toBe('POST');
    const body = postBody(init);
    expect(body.get('status')).toBe('PAUSED');
    expect(body.get('special_ad_categories')).toBe('["HOUSING"]');
    expect(body.get('daily_budget')).toBe('10000');
    expect(body.get('objective')).toBe('OUTCOME_TRAFFIC');
    expect(body.get('start_time')).toBe('2026-09-01T00:00:00+0000');
    expect(body.get('lifetime_budget')).toBeNull();
    // token nunca vai no corpo/URL
    expect(init.headers).not.toBeUndefined();
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer EAAG-teste-somente',
    );
  });

  it('createCampaign rejeita sem special_ad_categories e com budget XOR quebrado', async () => {
    const provider = makeProvider(vi.fn());
    await expect(
      provider.createCampaign({
        name: 'X',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: [],
      }),
    ).rejects.toThrow(/special_ad_categories/);
    await expect(
      provider.createCampaign({
        name: 'X',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 100,
        lifetimeBudgetCents: 200,
      }),
    ).rejects.toThrow(/exatamente um orçamento/);
  });

  it('createAdSet traduz targeting.geos e omite budget quando a campanha tem orçamento', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'cmp_1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'as_1' }));
    const provider = makeProvider(fetchImpl);
    await provider.createCampaign({
      name: 'C',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 10_000,
    });
    const result = await provider.createAdSet('cmp_1', {
      name: 'Ad Set 1',
      targeting: { geos: [{ countries: ['BR'] }] },
      budgetCents: 10_000,
    });
    expect(result.providerAdsetId).toBe('as_1');

    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/act_123456/adsets');
    const body = postBody(init);
    expect(body.get('campaign_id')).toBe('cmp_1');
    expect(body.get('status')).toBe('PAUSED');
    expect(body.get('targeting')).toBe('{"geo_locations":{"countries":["BR"]}}');
    expect(body.get('promoted_object')).toBe('{"page_id":"page_1"}');
    expect(body.get('daily_budget')).toBeNull(); // campanha já tem orçamento
  });

  it('createAdSet envia budget quando a campanha não tem orçamento próprio', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'cmp_2' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'as_2' }));
    const provider = makeProvider(fetchImpl);
    await provider.createCampaign({
      name: 'C',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
    });
    await provider.createAdSet('cmp_2', {
      name: 'Ad Set 2',
      targeting: { geos: [{ country: 'BR' }] },
      budgetCents: 5_000,
    });
    const [, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(postBody(init).get('daily_budget')).toBe('5000');
  });

  it('createCreative monta object_story_spec com image_hash, link e message', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, { id: 'cr_1' }));
    const provider = makeProvider(fetchImpl);
    const result = await provider.createCreative({
      name: 'Criativo 1',
      mediaRefs: ['media-a', 'media-b'],
      copyPrimary: 'Apartamento 2 quartos na Vila Madalena',
      landingUrl: 'https://imovel.exemplo.com/a',
      mediaHash: 'ignored-local-digest',
    });
    expect(result.providerCreativeId).toBe('cr_1');

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = postBody(init);
    expect(body.get('name')).toBe('Criativo 1');
    const spec = JSON.parse(body.get('object_story_spec') as string) as Record<string, unknown>;
    expect(spec['page_id']).toBe('page_1');
    const linkData = spec['link_data'] as Record<string, unknown>;
    expect(linkData['image_hash']).toBe('hash_media-a'); // primeira imagem (MVP single image)
    expect(linkData['link']).toBe('https://imovel.exemplo.com/a');
    expect(linkData['message']).toBe('Apartamento 2 quartos na Vila Madalena');
    expect(linkData['call_to_action']).toEqual({
      type: 'LEARN_MORE',
      value: { link: 'https://imovel.exemplo.com/a' },
    });
  });

  it('createCreative falha tipado sem defaultPageId e sem resolver de image_hash', async () => {
    const providerSemPage = makeProvider(vi.fn(), { defaultPageId: undefined });
    await expect(
      providerSemPage.createCreative({
        name: 'X',
        mediaRefs: ['media-a'],
        copyPrimary: 'c',
        landingUrl: 'https://x.com',
        mediaHash: 'h',
      }),
    ).rejects.toMatchObject({ kind: 'MISSING_PAGE_ID' });

    const providerSemResolver = new MetaGraphAdsProvider({
      accessToken: 't',
      adAccountId: 'act_1',
      fetchImpl: vi.fn(),
      defaultPageId: 'page_1',
    });
    await expect(
      providerSemResolver.createCreative({
        name: 'X',
        mediaRefs: ['media-a'],
        copyPrimary: 'c',
        landingUrl: 'https://x.com',
        mediaHash: 'h',
      }),
    ).rejects.toMatchObject({ kind: 'MISSING_IMAGE_HASH' });
  });

  it('createAd referencia adset e creative com status PAUSED', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, { id: 'ad_1' }));
    const provider = makeProvider(fetchImpl);
    const result = await provider.createAd('as_1', 'cr_1');
    expect(result.providerAdId).toBe('ad_1');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/act_123456/ads');
    const body = postBody(init);
    expect(body.get('adset_id')).toBe('as_1');
    expect(body.get('creative')).toBe('{"creative_id":"cr_1"}');
    expect(body.get('status')).toBe('PAUSED');
  });

  it('setCampaignStatus envia ACTIVE/PAUSED para o node da campanha', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, { success: true }));
    const provider = makeProvider(fetchImpl);
    await provider.setCampaignStatus('cmp_1', 'ACTIVE');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/cmp_1');
    expect(postBody(init).get('status')).toBe('ACTIVE');
  });

  it('archiveCampaign usa status ARCHIVED', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, { success: true }));
    const provider = makeProvider(fetchImpl);
    await provider.archiveCampaign('cmp_1');
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(postBody(init).get('status')).toBe('ARCHIVED');
  });

  it('getInsights mapeia spend para centavos, leads e custo por lead', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            date_start: '2026-08-01',
            date_stop: '2026-08-14',
            spend: '12345',
            impressions: '10000',
            reach: '8000',
            clicks: '100',
            ctr: '0.01',
            cpc: '123',
            cpm: '1234',
            frequency: '1.25',
            inline_link_clicks: '70',
            actions: [{ action_type: 'lead', value: '3' }],
            cost_per_action_type: [{ action_type: 'lead', value: '4115' }],
          },
        ],
      }),
    );
    const provider = makeProvider(fetchImpl);
    const insights = await provider.getInsights('cmp_1', {
      dateStart: '2026-08-01',
      dateEnd: '2026-08-14',
    });
    expect(insights['spendCents']).toBe(12345);
    expect(insights['impressions']).toBe(10000);
    expect(insights['reach']).toBe(8000);
    expect(insights['clicks']).toBe(100);
    expect(insights['linkClicks']).toBe(70);
    expect(insights['ctr']).toBe(0.01);
    expect(insights['cpcCents']).toBe(123);
    expect(insights['cpmCents']).toBe(1234);
    expect(insights['frequency']).toBe(1.25);
    expect(insights['leads']).toBe(3);
    expect(insights['costPerLeadCents']).toBe(4115);
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('/cmp_1/insights?');
    expect(url).toContain('fields=');
    expect(url).toContain(encodeURIComponent('{"since":"2026-08-01","until":"2026-08-14"}'));
  });

  it('getInsights retorna objeto vazio sem dados no período', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    const provider = makeProvider(fetchImpl);
    const insights = await provider.getInsights('cmp_1', {
      dateStart: '2026-08-01',
      dateEnd: '2026-08-02',
    });
    expect(insights).toEqual({});
  });

  it('429 é retryable com backoff simples (segunda tentativa ok)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, graphError(613, 'Calls to this api have exceeded the rate limit.'), {
          'retry-after': '1',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: 'cmp_retry' }));
    const provider = makeProvider(fetchImpl, { retryBaseDelayMs: 5 });
    const result = await provider.createCampaign({
      name: 'C',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 100,
    });
    expect(result.providerCampaignId).toBe('cmp_retry');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('erro 5xx também é retryable', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: 1, message: 'boom' } }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'cmp_5xx' }));
    const provider = makeProvider(fetchImpl, { retryBaseDelayMs: 5 });
    const result = await provider.createCampaign({
      name: 'C',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 100,
    });
    expect(result.providerCampaignId).toBe('cmp_5xx');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('4xx não-retryable lança erro tipado imediatamente', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, graphError(100, 'Invalid parameter')));
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.createCampaign({
        name: 'C',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 100,
      }),
    ).rejects.toMatchObject({ kind: 'BAD_REQUEST', retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('token inválido (190) lança erro tipado INVALID_TOKEN', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, graphError(190, 'Invalid OAuth access token.')));
    const provider = makeProvider(fetchImpl);
    const error = await provider
      .createCampaign({
        name: 'C',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 100,
      })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(error).toBeInstanceOf(MetaAdsProviderError);
    expect((error as MetaAdsProviderError).kind).toBe('INVALID_TOKEN');
    expect((error as MetaAdsProviderError).retryable).toBe(false);
  });

  it('permissão (200) e app em desenvolvimento (270) são erros tipados', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, graphError(200, 'Permissions error')));
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.createCampaign({
        name: 'C',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 100,
      }),
    ).rejects.toMatchObject({ kind: 'PERMISSION_DENIED' });

    const fetchImplDev = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, graphError(270, 'Development access only')));
    const providerDev = makeProvider(fetchImplDev);
    await expect(
      providerDev.createCampaign({
        name: 'C',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 100,
      }),
    ).rejects.toMatchObject({ kind: 'DEVELOPMENT_ACCESS' });
  });

  it('timeout via AbortSignal lança erro tipado TIMEOUT', async () => {
    const fetchImpl = vi.fn(
      (input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );
    const provider = makeProvider(fetchImpl, { timeoutMs: 20 });
    await expect(
      provider.createCampaign({
        name: 'C',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 100,
      }),
    ).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });

  it('updateCreative lança CREATIVE_IMMUTABLE (conteúdo do creative é imutável na Graph API)', async () => {
    const provider = makeProvider(vi.fn());
    await expect(
      provider.updateCreative('cr_1', {
        mediaRefs: ['media-c'],
        copyPrimary: 'novo copy',
        landingUrl: 'https://x.com',
      }),
    ).rejects.toMatchObject({ kind: 'CREATIVE_IMMUTABLE' });
  });

  it('listAssets agrupa ad accounts, pages, instagram e businesses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              id: 'act_9',
              name: 'Conta',
              account_status: 'ACTIVE',
              currency: 'BRL',
              timezone_name: 'America/Sao_Paulo',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'page_9', name: 'Imobiliária' }] }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              id: 'page_9',
              name: 'Imobiliária',
              instagram_business_account: { id: 'ig_9', username: '@imob' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'biz_9', name: 'Business' }] }));
    const provider = makeProvider(fetchImpl);
    const assets = await provider.listAssets();
    expect(assets.map((asset) => asset.kind)).toEqual([
      'AD_ACCOUNT',
      'PAGE',
      'INSTAGRAM_ACCOUNT',
      'BUSINESS',
    ]);
    expect(assets[0]).toMatchObject({
      providerAssetId: 'act_9',
      metadata: { currency: 'BRL' },
    });
  });

  it('listAssets ignora edges sem permissão mas mantém os acessíveis', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'act_9', name: 'Conta' }] }))
      .mockResolvedValueOnce(jsonResponse(400, graphError(200, 'Permissions error')))
      .mockResolvedValueOnce(jsonResponse(400, graphError(200, 'Permissions error')))
      .mockResolvedValueOnce(jsonResponse(400, graphError(200, 'Permissions error')));
    const provider = makeProvider(fetchImpl);
    const assets = await provider.listAssets();
    expect(assets.map((asset) => asset.kind)).toEqual(['AD_ACCOUNT']);
  });

  it('updateCampaignBudget e updateSchedule validam entradas e enviam para o node', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));
    const provider = makeProvider(fetchImpl);

    await provider.updateCampaignBudget('cmp_1', { dailyBudgetCents: 20_000 });
    const [url1, init1] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe('https://graph.facebook.com/v25.0/cmp_1');
    expect(postBody(init1).get('daily_budget')).toBe('20000');

    await provider.updateSchedule('cmp_1', { startAt: '2026-10-01T00:00:00.000Z' });
    const [, init2] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(postBody(init2).get('start_time')).toBe('2026-10-01T00:00:00+0000');

    await expect(
      provider.updateCampaignBudget('cmp_1', { dailyBudgetCents: 1, lifetimeBudgetCents: 2 }),
    ).rejects.toMatchObject({ kind: 'BAD_REQUEST' });
    await expect(provider.updateSchedule('cmp_1', {})).rejects.toMatchObject({
      kind: 'BAD_REQUEST',
    });
  });
});
