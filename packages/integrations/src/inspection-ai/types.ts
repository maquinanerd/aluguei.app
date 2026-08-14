export type InspectionMediaKind = 'PHOTO' | 'AUDIO' | 'VIDEO';
export type ObservationCategory =
  'DAMAGE' | 'CONDITION' | 'CLEANLINESS' | 'FURNITURE' | 'INSTALLATION' | 'OTHER';
export type Severity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface TranscribeResult {
  text: string;
  aiModel: string;
}

export interface ObservationSuggestion {
  category: ObservationCategory;
  severity: Severity;
  description: string;
  confidence: number;
}

/**
 * Provider de IA para vistoria. Recebe apenas referências de mídia (storageKey/MIME),
 * nunca PII de texto. As sugestões descrevem EVIDÊNCIA OBSERVÁVEL — nunca diagnosticam
 * causa invisível (ex.: "mancha visível na parede", não "infiltração do encanamento").
 */
export interface InspectionAiProvider {
  transcribeAudio(input: { storageKey: string; mimeType: string }): Promise<TranscribeResult>;
  suggestObservations(input: {
    storageKey: string;
    kind: 'PHOTO' | 'VIDEO';
    roomName?: string;
  }): Promise<ObservationSuggestion[]>;
}
