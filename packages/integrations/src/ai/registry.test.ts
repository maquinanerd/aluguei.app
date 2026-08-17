import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiAiProvider } from './gemini.js';
import { MockAiProvider } from './mock.js';
import { OpenAiAiProvider } from './openai.js';
import { getAiProvider } from './registry.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getAiProvider', () => {
  it('default → MockAiProvider (comportamento atual preservado)', () => {
    expect(getAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('provider openai sem chave → MockAiProvider (nunca chama LLM sem chave)', () => {
    expect(getAiProvider({ provider: 'openai' })).toBeInstanceOf(MockAiProvider);
  });

  it('provider openai com chave → OpenAiAiProvider', () => {
    const provider = getAiProvider({ provider: 'openai', openAiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(OpenAiAiProvider);
  });

  it('provider gemini com chave → GeminiAiProvider', () => {
    const provider = getAiProvider({ provider: 'gemini', geminiKey: 'ai-test' });
    expect(provider).toBeInstanceOf(GeminiAiProvider);
  });

  it('override injetado tem prioridade máxima', () => {
    const custom = new MockAiProvider();
    expect(getAiProvider({ provider: 'openai', openAiKey: 'sk-test', ai: custom })).toBe(custom);
  });

  it('lê AI_PROVIDER/OPENAI_API_KEY do env quando as opções não trazem', () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-env');
    expect(getAiProvider()).toBeInstanceOf(OpenAiAiProvider);
  });

  it('env sem chave → MockAiProvider', () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    expect(getAiProvider()).toBeInstanceOf(MockAiProvider);
  });
});
