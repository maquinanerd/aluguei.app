import { MockInspectionAiProvider } from './mock.js';
import type { InspectionAiProvider } from './types.js';

export interface InspectionAiRegistryOptions {
  ai?: InspectionAiProvider;
}

/** Seleciona o provider de IA de vistoria: override injetado > mock (padrão). */
export function getInspectionAiProvider(
  opts: InspectionAiRegistryOptions = {},
): InspectionAiProvider {
  return opts.ai ?? new MockInspectionAiProvider();
}
