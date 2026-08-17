import type { InspectionStatus, ObservationCategory, Severity, VisitStatus } from './types';

/** Labels pt-BR espelhando apps/web/src/lib/labels.ts (fonte única de tom do produto). */
export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  DRAFT: 'Rascunho',
  CAPTURING: 'Capturando',
  PROCESSING: 'Processando',
  REVIEW: 'Revisão',
  COMPLETED: 'Concluída',
  SIGNED: 'Assinada',
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'Não compareceu',
};

export const OBSERVATION_CATEGORY_LABELS: Record<ObservationCategory, string> = {
  DAMAGE: 'Dano',
  CONDITION: 'Estado',
  CLEANLINESS: 'Limpeza',
  FURNITURE: 'Mobília',
  INSTALLATION: 'Instalação',
  OTHER: 'Outro',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  NONE: 'Nenhuma',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: 'Apartamento',
  HOUSE: 'Casa',
  COMMERCIAL: 'Comercial',
  LAND: 'Terreno',
};

export const INSPECTION_TYPE_LABELS: Record<string, string> = {
  CHECKIN: 'Entrada',
  CHECKOUT: 'Saída',
  INTERMEDIATE: 'Intermediária',
};
