import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Cadastro de imóvel por áudio (ADR-104).
 *
 * O corretor fala, a IA transcreve e sugere campos, **e a pessoa confirma**.
 * Nada vira imóvel sem confirmação: o rascunho é uma peça própria, não um
 * imóvel meio-criado, justamente para que um palpite errado da IA não entre no
 * cadastro real e depois precise ser caçado.
 */

export const propertyDraftStatusSchema = z.enum([
  /** Gravando/anexando no celular; ainda não foi para a IA. */
  'CAPTURING',
  /** Áudio enviado; transcrição e extração em andamento. */
  'PROCESSING',
  /** Sugestões prontas, esperando a revisão de uma pessoa. */
  'REVIEW',
  /** Virou imóvel. */
  'CONFIRMED',
  /** A pessoa desistiu. */
  'DISCARDED',
  /** A IA falhou; o áudio continua guardado e dá para tentar de novo. */
  'FAILED',
]);
export type PropertyDraftStatus = z.infer<typeof propertyDraftStatusSchema>;

/**
 * Campos que a extração pode preencher. É a lista do que o cadastro real aceita
 * hoje — sugerir campo que não existe no imóvel seria prometer o que a
 * confirmação não consegue cumprir.
 */
export const propertyDraftFieldKeySchema = z.enum([
  'TITLE',
  'PROPERTY_TYPE',
  'PURPOSE',
  'TOTAL_AREA_SQM',
  'BEDROOMS',
  'BATHROOMS',
  'PARKING_SPOTS',
  'FURNISHED',
  'PETS_ALLOWED',
  'MONTHLY_RENT_CENTS',
  'SALE_PRICE_CENTS',
  'CONDO_FEE_CENTS',
  'IPTU_CENTS',
  'STREET',
  'NUMBER',
  'COMPLEMENT',
  'NEIGHBORHOOD',
  'CITY',
  'STATE',
  'ZIP_CODE',
]);
export type PropertyDraftFieldKey = z.infer<typeof propertyDraftFieldKeySchema>;

/**
 * Situação de cada campo na revisão — é o que a tela colore.
 *
 * `FROM_PHOTO` não existe: nenhuma análise de imagem roda aqui, e um estado que
 * o sistema nunca produz seria enfeite que sugere capacidade inexistente.
 */
export const propertyDraftFieldStateSchema = z.enum([
  /** A IA ouviu com clareza. */
  'FROM_AUDIO',
  /** A IA ouviu com hesitação ("acho que", "mais ou menos") — precisa confirmar. */
  'NEEDS_CONFIRMATION',
  /** Não foi dito e o cadastro precisa. */
  'MISSING',
  /** A pessoa mudou o que a IA sugeriu. */
  'EDITED',
]);
export type PropertyDraftFieldState = z.infer<typeof propertyDraftFieldStateSchema>;

export const propertyDraftFieldSchema = z.object({
  key: propertyDraftFieldKeySchema,
  /** Sempre texto: é o que a pessoa lê e edita. A conversão acontece ao confirmar. */
  value: z.string().nullable(),
  state: propertyDraftFieldStateSchema,
  /** Trecho do áudio que originou o valor — a tela liga campo e transcrição. */
  evidence: z.string().nullable(),
});
export type PropertyDraftField = z.infer<typeof propertyDraftFieldSchema>;

export const propertyDraftSchema = z.object({
  id: uuidSchema,
  status: propertyDraftStatusSchema,
  /** Transcrição já filtrada: CPF, telefone e e-mail saem antes de ser guardada. */
  transcript: z.string().nullable(),
  audioKey: z.string().nullable(),
  audioSeconds: z.number().int().nonnegative().nullable(),
  failureReason: z.string().nullable(),
  propertyId: uuidSchema.nullable(),
  fields: z.array(propertyDraftFieldSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const propertyDraftResponseSchema = z.object({ draft: propertyDraftSchema });
export const listPropertyDraftsResponseSchema = z.object({
  drafts: z.array(propertyDraftSchema),
});

/** Áudio ditado tem minutos, não horas: o limite evita upload que não termina. */
export const DRAFT_AUDIO_SIZE_LIMIT_BYTES = 25 * 1024 * 1024;

export const DRAFT_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
] as const;
export const draftAudioMimeTypeSchema = z.enum(DRAFT_AUDIO_MIME_TYPES);

export const requestDraftAudioUrlRequestSchema = z.object({
  mimeType: draftAudioMimeTypeSchema,
  sizeBytes: z.number().int().positive(),
});

export const requestDraftAudioUrlResponseSchema = z.object({
  url: z.string(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
});

export const processDraftAudioRequestSchema = z.object({
  key: z.string().min(1),
  /** Duração informada pelo gravador, só para a tela; não vale como medida. */
  seconds: z.number().int().nonnegative().optional(),
});

export const updatePropertyDraftFieldsRequestSchema = z.object({
  fields: z
    .array(
      z.object({
        key: propertyDraftFieldKeySchema,
        /** `null` apaga o valor e devolve o campo para "faltando". */
        value: z.string().max(200).nullable(),
      }),
    )
    .min(1)
    .max(40),
});

/** Confirmar é ato de pessoa: a rota não aceita campo novo, só o que está no rascunho. */
export const confirmPropertyDraftResponseSchema = z.object({
  draft: propertyDraftSchema,
  propertyId: uuidSchema,
});
