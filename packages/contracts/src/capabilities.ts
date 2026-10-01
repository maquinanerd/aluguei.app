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
/** `AUTENTIQUE_SANDBOX` = Autentique com documento de teste: assina de verdade, mas sem validade. */
export const signatureProviderModeSchema = z
  .enum(['FAKE', 'AUTENTIQUE_SANDBOX', 'AUTENTIQUE', 'D4SIGN'])
  .nullable();
export const screeningProviderModeSchema = z.enum(['FAKE', 'SERASA', 'SPC']).nullable();
export const metaModeSchema = z.enum(['dry_run', 'live']).nullable();
/**
 * Transcrição de áudio (ADR-104). `null` significa **desligado**, e desligado é
 * o padrão: sem provedor com retenção zero declarada, o cadastro por áudio nem
 * é oferecido — a tela explica em vez de deixar o corretor gravar à toa.
 */
export const audioTranscriptionModeSchema = z.enum(['MOCK']).nullable();

export const capabilitiesResponseSchema = z.object({
  providers: z.object({
    /** Cobrança e split. `FAKE` = nenhum valor é movimentado. */
    payments: paymentProviderModeSchema,
    /** Envelope de assinatura. `FAKE` e `AUTENTIQUE_SANDBOX` = sem validade jurídica. */
    signature: signatureProviderModeSchema,
    /** Análise cadastral. `FAKE` = só os dados informados na candidatura. */
    screening: screeningProviderModeSchema,
    /** Anúncio pago. `dry_run` = nada é publicado na Meta. */
    meta: metaModeSchema,
    /** Transcrição do cadastro por áudio. `MOCK` = texto de exemplo, não é o que foi dito. */
    audio: audioTranscriptionModeSchema,
  }),
});

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
export type PaymentProviderMode = z.infer<typeof paymentProviderModeSchema>;
export type SignatureProviderMode = z.infer<typeof signatureProviderModeSchema>;
export type ScreeningProviderMode = z.infer<typeof screeningProviderModeSchema>;
export type AudioTranscriptionMode = z.infer<typeof audioTranscriptionModeSchema>;
