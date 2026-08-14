/**
 * Validação do material publicitário de um imóvel (Ad Material).
 *
 * Regras (docs/META_MCP.md):
 * - property precisa estar READY/PUBLISHED e possuir landing page pública válida
 * - usar somente mídia do próprio imóvel e aprovada para anúncio (PHOTO pública)
 * - nunca usar documentos/fotos privadas de vistoria
 * - nunca enviar nome/CPF/telefone do proprietário ou locatário à Meta
 */
export interface AdMediaRow {
  id: string;
  propertyId: string;
  kind: string; // PHOTO | DOCUMENT | FLOORPLAN
  isPublic: boolean;
}

export interface AdMaterialInput {
  propertyId: string;
  propertyStatus: string; // ACTIVE | ARCHIVED
  listingStatus: string | null; // DRAFT | READY | PUBLISHED | PAUSED | ARCHIVED
  landingUrl: string | null;
  mediaSelection: string[]; // ids de property_media
  mediaRows: AdMediaRow[];
  copyPrimary: string;
  ownerName?: string | null; // usado apenas para detectar PII no copy
  tenantName?: string | null;
}

export interface AdMaterialResult {
  valid: boolean;
  errors: string[];
}

const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE_REGEX = /\b(\+?\d{2})?\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/;

/** Detecta PII comum (nome completo de pessoa, CPF, telefone) no copy. */
export function containsPii(text: string, names: Array<string | null | undefined>): boolean {
  if (CPF_REGEX.test(text) || PHONE_REGEX.test(text)) {
    return true;
  }
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const name of names) {
    if (!name) {
      continue;
    }
    const normalized = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (normalized.split(/\s+/).filter(Boolean).length >= 2 && tokens.includes(normalized)) {
      return true;
    }
  }
  return false;
}

export function validateAdMaterial(input: AdMaterialInput): AdMaterialResult {
  const errors: string[] = [];

  if (input.propertyStatus !== 'ACTIVE') {
    errors.push('Imóvel precisa estar ativo para anúncio');
  }
  if (input.listingStatus !== 'READY' && input.listingStatus !== 'PUBLISHED') {
    errors.push('Listing precisa estar READY ou PUBLISHED');
  }
  if (!input.landingUrl || !/^https:\/\/.+/i.test(input.landingUrl)) {
    errors.push('Landing page pública inválida (https obrigatório)');
  }
  if (input.mediaSelection.length === 0) {
    errors.push('Selecione ao menos uma mídia para o anúncio');
  }

  const mediaById = new Map(input.mediaRows.map((m) => [m.id, m]));
  for (const mediaId of input.mediaSelection) {
    const media = mediaById.get(mediaId);
    if (!media) {
      errors.push(`Mídia ${mediaId} não pertence ao imóvel`);
      continue;
    }
    if (media.propertyId !== input.propertyId) {
      errors.push(`Mídia ${mediaId} não pertence ao imóvel`);
    }
    if (media.kind !== 'PHOTO' || !media.isPublic) {
      errors.push(`Mídia ${mediaId} não é foto pública aprovada para anúncio`);
    }
  }

  if (input.copyPrimary.trim().length === 0) {
    errors.push('Copy não pode ser vazio');
  }
  if (containsPii(input.copyPrimary, [input.ownerName, input.tenantName])) {
    errors.push('Copy não pode conter nome/CPF/telefone do proprietário ou locatário');
  }

  return { valid: errors.length === 0, errors };
}
