import { createHash } from 'node:crypto';
import type { InspectionAiProvider, ObservationSuggestion, TranscribeResult } from './types.js';

const DEFAULT_SUGGESTIONS: ObservationSuggestion[] = [
  {
    category: 'CONDITION',
    severity: 'LOW',
    description: 'Estado visual sem danos aparentes',
    confidence: 0.7,
  },
];

const ROOM_SUGGESTIONS: Record<string, ObservationSuggestion[]> = {
  default: DEFAULT_SUGGESTIONS,
  quarto: [
    {
      category: 'DAMAGE',
      severity: 'MEDIUM',
      description: 'Mancha visível na parede do quarto',
      confidence: 0.8,
    },
    {
      category: 'FURNITURE',
      severity: 'LOW',
      description: 'Móvel presente no ambiente',
      confidence: 0.75,
    },
  ],
  cozinha: [
    {
      category: 'CLEANLINESS',
      severity: 'LOW',
      description: 'Superfície com resíduos aparentes',
      confidence: 0.7,
    },
  ],
  banheiro: [
    {
      category: 'INSTALLATION',
      severity: 'MEDIUM',
      description: 'Rejunte com desgaste visível',
      confidence: 0.75,
    },
  ],
  sala: [
    {
      category: 'CONDITION',
      severity: 'LOW',
      description: 'Piso com riscos visíveis',
      confidence: 0.7,
    },
  ],
};

/**
 * Provider mock determinístico (dev/test): transcrição fixture por hash da key;
 * sugestões fixas por kind/roomName. Sem rede, sem diagnóstico de causa.
 */
export class MockInspectionAiProvider implements InspectionAiProvider {
  transcribeAudio(input: { storageKey: string; mimeType: string }): Promise<TranscribeResult> {
    const hash = createHash('sha256').update(input.storageKey).digest('hex').slice(0, 8);
    return Promise.resolve({
      text: `Transcrição mock (${hash}): ambiente em estado de conservação regular, sem avarias evidentes na descrição.`,
      aiModel: 'mock-inspection',
    });
  }

  suggestObservations(input: {
    storageKey: string;
    kind: 'PHOTO' | 'VIDEO';
    roomName?: string;
  }): Promise<ObservationSuggestion[]> {
    const roomKey = (input.roomName ?? '').toLowerCase();
    let suggestions: ObservationSuggestion[] | undefined;
    for (const [key, value] of Object.entries(ROOM_SUGGESTIONS)) {
      if (key !== 'default' && roomKey.includes(key)) {
        suggestions = value;
        break;
      }
    }
    const selected = suggestions ?? DEFAULT_SUGGESTIONS;
    return Promise.resolve(selected.map((s) => ({ ...s })));
  }
}
