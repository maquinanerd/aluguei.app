/**
 * Regras de Housing / Special Ad Category (Meta).
 *
 * Imóveis são publicidade de moradia (HOUSING). A Meta restringe targeting:
 * não é permitido discriminar por gênero, idade, CEP seletivo etc.
 * Este módulo valida o targeting ANTES de qualquer envio — a API externa
 * nunca deve receber targeting incompatível.
 */
export interface HousingTargeting {
  /** Localizadores do Meta (ex.: geo_locations) — restritos aos permitidos pela org. */
  geos?: unknown[];
  /** Perfis de interesse/público customizado. */
  customAudiences?: unknown[];
  /** Regras de idade mínima (ex.: 18). Idade máxima inválida para HOUSING. */
  ageMin?: number;
  ageMax?: number;
  /** Gênero — nunca permitido em HOUSING. */
  genders?: unknown[];
  /** Outros campos de targeting que a Meta restringe em HOUSING. */
  extra?: Record<string, unknown>;
}

export interface HousingValidationResult {
  valid: boolean;
  errors: string[];
}

/** Tipos de categoria especial exigidos para anúncio de moradia. */
export const SPECIAL_AD_CATEGORY_HOUSING = 'HOUSING' as const;

/** Valida targeting contra a política Housing (Special Ad Category). */
export function validateHousingTargeting(
  targeting: HousingTargeting,
  allowedGeos: unknown[] = [],
): HousingValidationResult {
  const errors: string[] = [];

  if (
    targeting.genders !== undefined &&
    Array.isArray(targeting.genders) &&
    targeting.genders.length > 0
  ) {
    errors.push('Housing: targeting por gênero não permitido');
  }
  if (targeting.ageMax !== undefined && targeting.ageMax > 0) {
    errors.push('Housing: idade máxima não permitida');
  }
  if (targeting.ageMin !== undefined && targeting.ageMin < 18) {
    errors.push('Housing: idade mínima não pode discriminar menores de 18');
  }
  if (
    targeting.customAudiences !== undefined &&
    Array.isArray(targeting.customAudiences) &&
    targeting.customAudiences.length > 0
  ) {
    errors.push('Housing: audiências customizadas não permitidas');
  }

  // Geografia restrita aos locais permitidos pela organização (política Housing).
  const geos = targeting.geos ?? [];
  if (allowedGeos.length > 0 && geos.length > 0) {
    const serializedAllowed = new Set(allowedGeos.map((geo) => JSON.stringify(geo)));
    for (const geo of geos) {
      if (!serializedAllowed.has(JSON.stringify(geo))) {
        errors.push('Housing: geo fora da área permitida pela organização');
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Categoria especial obrigatória para campanhas de imóveis. */
export function requiredSpecialAdCategories(): string[] {
  return [SPECIAL_AD_CATEGORY_HOUSING];
}
