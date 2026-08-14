import { randomUUID } from 'node:crypto';
import { INSPECTION_MEDIA_SIZE_LIMITS, MEDIA_SIZE_LIMITS } from '@aluguei/contracts';
import type { MediaKind, MimeType } from '@aluguei/contracts';
import type { InspectionMediaKind } from '@aluguei/integrations';
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

const INSPECTION_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
};

/** Chave de storage de vistoria — prefixo próprio, nunca confunde com property_media. */
export function buildInspectionStorageKey(
  orgId: string,
  inspectionId: string,
  kind: InspectionMediaKind,
  mimeType: string,
): string {
  const ext = INSPECTION_EXT_BY_MIME[mimeType] ?? 'bin';
  return `orgs/${orgId}/inspections/${inspectionId}/${kind.toLowerCase()}/${randomUUID()}.${ext}`;
}

export function assertInspectionSizeAllowed(kind: InspectionMediaKind, sizeBytes: number): void {
  const limit = INSPECTION_MEDIA_SIZE_LIMITS[kind];
  if (sizeBytes > limit) {
    throw new DomainError(
      'INVALID_INPUT',
      `Arquivo excede o limite de ${String(Math.round(limit / (1024 * 1024)))}MB para ${kind}`,
    );
  }
}

export function inferInspectionKindFromKey(key: string): InspectionMediaKind {
  const segment = key.split('/')[4];
  if (segment === 'audio') {
    return 'AUDIO';
  }
  if (segment === 'video') {
    return 'VIDEO';
  }
  return 'PHOTO';
}
