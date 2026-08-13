import { randomUUID } from 'node:crypto';
import { MEDIA_SIZE_LIMITS } from '@aluguei/contracts';
import type { MediaKind, MimeType } from '@aluguei/contracts';
import { DomainError } from '@aluguei/domain';
const EXT_BY_MIME: Record<MimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Chave de storage sempre gerada pelo servidor (nunca do client). */
export function buildStorageKey(
  orgId: string,
  propertyId: string,
  kind: MediaKind,
  mimeType: MimeType,
): string {
  const ext = EXT_BY_MIME[mimeType];
  return `orgs/${orgId}/properties/${propertyId}/${kind.toLowerCase()}/${randomUUID()}.${ext}`;
}

export function assertSizeAllowed(kind: MediaKind, sizeBytes: number): void {
  const limit = MEDIA_SIZE_LIMITS[kind];
  if (sizeBytes > limit) {
    throw new DomainError(
      'INVALID_INPUT',
      `Arquivo excede o limite de ${String(Math.round(limit / (1024 * 1024)))}MB para ${kind}`,
    );
  }
}

export function isPublicMediaKind(kind: string): boolean {
  return kind === 'PHOTO' || kind === 'FLOORPLAN';
}
