import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockInspectionAiProvider } from './mock.js';
import { OpenAiInspectionAiProvider } from './openai.js';
import { getInspectionAiProvider } from './registry.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getInspectionAiProvider', () => {
  it('default → MockInspectionAiProvider (comportamento atual preservado)', () => {
    expect(getInspectionAiProvider()).toBeInstanceOf(MockInspectionAiProvider);
  });

  it('openai com chave mas sem fetchMedia → mock (nunca transcreve sem storage)', () => {
    expect(getInspectionAiProvider({ provider: 'openai', openAiKey: 'sk-test' })).toBeInstanceOf(
      MockInspectionAiProvider,
    );
  });

  it('openai com chave e fetchMedia → OpenAiInspectionAiProvider', () => {
    const fetchMedia = (input: { storageKey: string }): Promise<Blob> =>
      Promise.resolve(new Blob([input.storageKey]));
    const provider = getInspectionAiProvider({
      provider: 'openai',
      openAiKey: 'sk-test',
      fetchMedia,
    });
    expect(provider).toBeInstanceOf(OpenAiInspectionAiProvider);
  });

  it('override injetado tem prioridade máxima', () => {
    const custom = new MockInspectionAiProvider();
    const fetchMedia = (): Promise<Blob> => Promise.resolve(new Blob(['x']));
    expect(
      getInspectionAiProvider({ provider: 'openai', openAiKey: 'sk', fetchMedia, ai: custom }),
    ).toBe(custom);
  });

  it('lê AI_PROVIDER/OPENAI_API_KEY do env quando as opções não trazem', () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-env');
    const fetchMedia = (): Promise<Blob> => Promise.resolve(new Blob(['x']));
    expect(getInspectionAiProvider({ fetchMedia })).toBeInstanceOf(OpenAiInspectionAiProvider);
  });
});
