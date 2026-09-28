import { z } from 'zod';

/**
 * O que a instalação consegue fazer de verdade hoje (Onda 4).
 *
 * Existe porque o painel precisa dizer "modo de teste" **pela configuração
 * real**, não por texto fixo na tela. Sem isto, ou a faixa de aviso mente
 * quando o provider real entrar, ou alguém esquece de tirá-la — e os dois erros
 * são piores do que não ter aviso: o primeiro esconde um efeito externo de
 * verdade, o segundo sugere que o dinheiro se moveu quando não se moveu.
 *
 * Não expõe credencial nem endpoint: só qual adapter está no ar.
 */

/** `null` = nenhum provider configurado; a ação nem é oferecida. */
export const paymentProviderModeSchema = z.enum(['FAKE', 'ASAAS']).nullable();
export const signatureProviderModeSchema = z.enum(['FAKE', 'CLICKSIGN', 'D4SIGN']).nullable();
export const screeningProviderModeSchema = z.enum(['FAKE', 'SERASA', 'SPC']).nullable();
export const metaModeSchema = z.enum(['dry_run', 'live']).nullable();

export const capabilitiesResponseSchema = z.object({
  providers: z.object({
    /** Cobrança e split. `FAKE` = nenhum valor é movimentado. */
    payments: paymentProviderModeSchema,
    /** Envelope de assinatura. `FAKE` = sem validade jurídica. */
    signature: signatureProviderModeSchema,
    /** Análise cadastral. `FAKE` = só os dados informados na candidatura. */
    screening: screeningProviderModeSchema,
    /** Anúncio pago. `dry_run` = nada é publicado na Meta. */
    meta: metaModeSchema,
  }),
});

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
export type PaymentProviderMode = z.infer<typeof paymentProviderModeSchema>;
export type SignatureProviderMode = z.infer<typeof signatureProviderModeSchema>;
export type ScreeningProviderMode = z.infer<typeof screeningProviderModeSchema>;
