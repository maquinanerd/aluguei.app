import { z } from 'zod';
import { propertyMediaSchema } from './property.js';

export const mediaKindSchema = z.enum(['PHOTO', 'DOCUMENT', 'FLOORPLAN']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const mimeTypeSchema = z.enum(ALLOWED_MIME_TYPES);
export type MimeType = z.infer<typeof mimeTypeSchema>;

/** Tamanho máximo por tipo (bytes). */
export const MEDIA_SIZE_LIMITS: Record<z.infer<typeof mediaKindSchema>, number> = {
  PHOTO: 10 * 1024 * 1024,
  FLOORPLAN: 10 * 1024 * 1024,
  DOCUMENT: 20 * 1024 * 1024,
};

export const requestUploadUrlRequestSchema = z.object({
  kind: mediaKindSchema,
  mimeType: mimeTypeSchema,
  sizeBytes: z.number().int().positive(),
});

export const requestUploadUrlResponseSchema = z.object({
  url: z.string(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
});

export const confirmMediaRequestSchema = z.object({
  key: z.string().min(1),
});

export const confirmMediaResponseSchema = z.object({ media: propertyMediaSchema });
