import { describe, expect, it, vi } from 'vitest';
import { META_GRAPH_DEFAULT_VERSION, WhatsAppProviderError } from './meta.js';
import {
  FakeWhatsAppNumberVerifier,
  MetaWhatsAppNumberVerifier,
  fakeWhatsAppOwnerToken,
  getWhatsAppNumberVerifier,
} from './verifier.js';

/**
 * G3, trilha E2 (auditoria 2026-09-10, P1-18, segunda parte): a prova de posse do número usa o
 * token da própria conexão (a conta do WhatsApp Business da imobiliária), nunca a credencial da
 * plataforma. Em teste e homologação o verificador é FAKE: nenhuma chamada à Graph API.
 */
function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FakeWhatsAppNumberVerifier', () => {
  it('o token de dono do número comprova a posse, sem rede', async () => {
    const verifier = new FakeWhatsAppNumberVerifier();
    const info = await verifier.verifyNumber({
      phoneNumberId: '1001',
      accessToken: fakeWhatsAppOwnerToken('1001'),
    });
    expect(info.phoneNumberId).toBe('1001');
    expect(info.verifiedName).toBeTruthy();
    expect(verifier.calls).toEqual([{ phoneNumberId: '1001' }]);
  });

  it('token de outro número falha como a Graph API (erro 100, sem retry)', async () => {
    const verifier = new FakeWhatsAppNumberVerifier();
    const promise = verifier.verifyNumber({
      phoneNumberId: '1001',
      accessToken: fakeWhatsAppOwnerToken('2002'),
    });
    await expect(promise).rejects.toBeInstanceOf(WhatsAppProviderError);
    await expect(promise).rejects.toMatchObject({
      status: 400,
      providerCode: 100,
      retryable: false,
    });
  });

  it('o formato do token fake é estável (usado nos testes e no Playwright)', () => {
    expect(fakeWhatsAppOwnerToken('1001')).toBe('fake-wa-owner:1001');
  });
});

describe('MetaWhatsAppNumberVerifier', () => {
  it('consulta GET /<phone_number_id> com o token da conexão', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson({
        id: '1001',
        verified_name: 'Imobiliária Exemplo',
        display_phone_number: '+55 11 99999-0001',
        code_verification_status: 'VERIFIED',
      }),
    );
    const verifier = new MetaWhatsAppNumberVerifier({ fetchImpl });
    const info = await verifier.verifyNumber({
      phoneNumberId: '1001',
      accessToken: 'token-da-imobiliaria',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/${META_GRAPH_DEFAULT_VERSION}/1001`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer token-da-imobiliaria',
    );
    expect(info).toMatchObject({
      phoneNumberId: '1001',
      verifiedName: 'Imobiliária Exemplo',
      displayPhoneNumber: '+55 11 99999-0001',
    });
  });

  it('número fora da conta do token: propaga o erro tipado da Graph API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      errorJson(400, {
        error: { message: 'Unsupported get request', code: 100, error_subcode: 33 },
      }),
    );
    const verifier = new MetaWhatsAppNumberVerifier({ fetchImpl });
    const promise = verifier.verifyNumber({ phoneNumberId: '1001', accessToken: 'outro' });
    await expect(promise).rejects.toMatchObject({ status: 400, providerCode: 100 });
  });
});

describe('getWhatsAppNumberVerifier', () => {
  it('dry_run → FAKE; live → Graph API; sem modo → sem verificador', () => {
    expect(getWhatsAppNumberVerifier({ mode: 'dry_run' })).toBeInstanceOf(
      FakeWhatsAppNumberVerifier,
    );
    expect(getWhatsAppNumberVerifier({ mode: 'live' })).toBeInstanceOf(MetaWhatsAppNumberVerifier);
    expect(getWhatsAppNumberVerifier({})).toBeNull();
    expect(getWhatsAppNumberVerifier({ mode: 'desconhecido' })).toBeNull();
  });

  it('verificador injetado tem precedência', () => {
    const injected = new FakeWhatsAppNumberVerifier();
    expect(getWhatsAppNumberVerifier({ mode: 'live', verifier: injected })).toBe(injected);
  });
});
