'use client';

import { useQuery } from './use-query';

/**
 * O que esta instalação consegue fazer de verdade (`GET /capabilities`, Onda 4).
 *
 * A faixa "modo de teste" das telas sai daqui, e não de texto fixo: quando o
 * provider real entrar, o aviso some sozinho; enquanto não entrar, ele não some
 * por esquecimento. As duas falhas do texto fixo são graves — uma esconde um
 * efeito externo de verdade, a outra sugere que o dinheiro se moveu.
 */

export type ModoPagamento = 'FAKE' | 'ASAAS' | null;
/** `*_SANDBOX`: o pedido de assinatura sai de verdade, mas o documento é de teste. */
export type ModoAssinatura =
  | 'FAKE'
  | 'AUTENTIQUE_SANDBOX'
  | 'AUTENTIQUE'
  | 'CLICKSIGN_SANDBOX'
  | 'CLICKSIGN'
  | 'D4SIGN'
  | null;
export type ModoAnalise = 'FAKE' | 'SERASA' | 'SPC' | null;
export type ModoMeta = 'dry_run' | 'live' | null;

export interface Capacidades {
  providers: {
    payments: ModoPagamento;
    signature: ModoAssinatura;
    screening: ModoAnalise;
    meta: ModoMeta;
    /** Transcrição do cadastro por áudio; `null` = recurso desligado. */
    audio: ModoAudio;
  };
}

/** `null` = sem provedor com retenção zero declarada (ADR-104): o recurso nem é oferecido. */
export type ModoAudio = 'MOCK' | null;

export function useCapacidades() {
  return useQuery<Capacidades>('/capabilities');
}

/**
 * Enquanto a resposta não chega, tratamos como **em teste**: é o lado seguro do
 * erro. Avisar sem precisar é ruído; deixar de avisar dá a entender que o efeito
 * externo aconteceu.
 */
export function emTeste(modo: string | null | undefined): boolean {
  return (
    modo === undefined ||
    modo === null ||
    modo === 'FAKE' ||
    modo === 'dry_run' ||
    modo === 'AUTENTIQUE_SANDBOX' ||
    modo === 'CLICKSIGN_SANDBOX'
  );
}

/**
 * Provedor de assinatura no sandbox (Autentique ou Clicksign): o pedido sai por e-mail, mas o
 * documento não vale. `null` quando a assinatura não está em sandbox de provedor real.
 */
export function assinaturaEmSandbox(modo: string | null | undefined): string | null {
  if (modo === 'AUTENTIQUE_SANDBOX') {
    return 'Autentique';
  }
  if (modo === 'CLICKSIGN_SANDBOX') {
    return 'Clicksign';
  }
  return null;
}

/** Nome do provider real que falta, para o aviso dizer o que está por vir. */
export const PROVIDER_REAL = {
  payments: 'Asaas',
  signature: 'Autentique',
  screening: 'Serasa e SPC',
  meta: 'Meta Ads',
} as const;
