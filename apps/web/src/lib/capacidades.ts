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
export type ModoAssinatura = 'FAKE' | 'CLICKSIGN' | 'D4SIGN' | null;
export type ModoAnalise = 'FAKE' | 'SERASA' | 'SPC' | null;
export type ModoMeta = 'dry_run' | 'live' | null;

export interface Capacidades {
  providers: {
    payments: ModoPagamento;
    signature: ModoAssinatura;
    screening: ModoAnalise;
    meta: ModoMeta;
  };
}

export function useCapacidades() {
  return useQuery<Capacidades>('/capabilities');
}

/**
 * Enquanto a resposta não chega, tratamos como **em teste**: é o lado seguro do
 * erro. Avisar sem precisar é ruído; deixar de avisar dá a entender que o efeito
 * externo aconteceu.
 */
export function emTeste(modo: string | null | undefined): boolean {
  return modo === undefined || modo === null || modo === 'FAKE' || modo === 'dry_run';
}

/** Nome do provider real que falta, para o aviso dizer o que está por vir. */
export const PROVIDER_REAL = {
  payments: 'Asaas',
  signature: 'Clicksign',
  screening: 'Serasa e SPC',
  meta: 'Meta Ads',
} as const;
