import { MetaWhatsAppAdapter, WhatsAppProviderError } from './meta.js';
import type { WhatsAppConnectionInfo } from './meta.js';

/**
 * Prova de posse do número do WhatsApp (auditoria 2026-09-10, P1-18, segunda parte): a
 * organização informa o token da própria conta do WhatsApp Business, e o número é conferido na
 * Graph API com esse token (`GET /<PHONE_NUMBER_ID>` responde só para números da conta do
 * token). A credencial da plataforma (`WHATSAPP_ACCESS_TOKEN`) nunca entra na prova.
 */
export interface VerifyWhatsAppNumberInput {
  phoneNumberId: string;
  /** Token da conexão (decifrado só para esta chamada; nunca registrado). */
  accessToken: string;
}

export interface WhatsAppNumberVerifier {
  verifyNumber(input: VerifyWhatsAppNumberInput): Promise<WhatsAppConnectionInfo>;
}

export interface MetaWhatsAppNumberVerifierOptions {
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Verificação real pela Graph API, com o token da conexão (reusa `testConnection` do adapter). */
export class MetaWhatsAppNumberVerifier implements WhatsAppNumberVerifier {
  constructor(private readonly opts: MetaWhatsAppNumberVerifierOptions = {}) {}

  verifyNumber(input: VerifyWhatsAppNumberInput): Promise<WhatsAppConnectionInfo> {
    const adapter = new MetaWhatsAppAdapter({
      accessToken: input.accessToken,
      phoneNumberId: input.phoneNumberId,
      verifyToken: '',
      ...(this.opts.apiVersion !== undefined ? { apiVersion: this.opts.apiVersion } : {}),
      ...(this.opts.fetchImpl !== undefined ? { fetchImpl: this.opts.fetchImpl } : {}),
      ...(this.opts.timeoutMs !== undefined ? { timeoutMs: this.opts.timeoutMs } : {}),
    });
    return adapter.testConnection();
  }
}

/** Token que o verificador FAKE aceita como dono do número (teste, dev e homologação). */
export function fakeWhatsAppOwnerToken(phoneNumberId: string): string {
  return `fake-wa-owner:${phoneNumberId}`;
}

/**
 * Verificador FAKE (dry_run): determinístico e sem rede. O token `fake-wa-owner:<id>` é o dono
 * do número `<id>`; qualquer outro falha como a Graph API falha com o token de outra conta
 * (HTTP 400, código 100, sem retry).
 */
export class FakeWhatsAppNumberVerifier implements WhatsAppNumberVerifier {
  readonly calls: Array<{ phoneNumberId: string }> = [];

  verifyNumber(input: VerifyWhatsAppNumberInput): Promise<WhatsAppConnectionInfo> {
    this.calls.push({ phoneNumberId: input.phoneNumberId });
    if (input.accessToken !== fakeWhatsAppOwnerToken(input.phoneNumberId)) {
      return Promise.reject(
        new WhatsAppProviderError({
          status: 400,
          providerCode: 100,
          providerSubcode: 33,
          message: 'FakeWhatsApp: o token não tem acesso a este número',
          retryable: false,
        }),
      );
    }
    return Promise.resolve({
      phoneNumberId: input.phoneNumberId,
      verifiedName: 'Número de teste (FAKE)',
      displayPhoneNumber: `+00 ${input.phoneNumberId}`,
      codeVerificationStatus: 'VERIFIED',
    });
  }
}

export interface WhatsAppNumberVerifierOptions {
  mode?: string; // dry_run | live
  verifier?: WhatsAppNumberVerifier;
  fetchImpl?: typeof fetch;
}

/**
 * Seleciona o verificador: injetado > live (Graph API) > dry_run (FAKE). Modo ausente ou
 * desconhecido → null: sem verificador, nenhuma conexão vira VERIFIED (mesma regra do messenger,
 * P1-12).
 */
export function getWhatsAppNumberVerifier(
  opts: WhatsAppNumberVerifierOptions = {},
): WhatsAppNumberVerifier | null {
  if (opts.verifier) {
    return opts.verifier;
  }
  if (opts.mode === 'live') {
    return new MetaWhatsAppNumberVerifier(
      opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {},
    );
  }
  if (opts.mode === 'dry_run') {
    return new FakeWhatsAppNumberVerifier();
  }
  return null;
}
