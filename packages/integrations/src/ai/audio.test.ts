import { describe, expect, it } from 'vitest';
import { MockAudioAiProvider, getAudioAiProvider } from './audio.js';

/**
 * A trava do ADR-104 tem de falhar fechada. Se um dia alguém trocar o padrão
 * para "liga quando não souber", é este teste que quebra — e não um corretor
 * descobrindo que a voz dele foi parar num provedor que guarda áudio.
 */
describe('transcrição de áudio — retenção declarada', () => {
  it('sem declaração de retenção, não existe transcritor', () => {
    expect(getAudioAiProvider({ retention: undefined })).toEqual({
      provider: null,
      reason: 'RETENTION_NOT_DECLARED',
    });
  });

  it('declaração diferente de ZERO também não serve', () => {
    for (const retention of ['30d', 'zero', 'ZERO_ISH', '']) {
      expect(getAudioAiProvider({ retention }).provider, retention).toBeNull();
    }
  });

  it('a trava vale inclusive para o provider injetado', () => {
    // O override existe para teste e desenvolvimento; ele não é uma porta dos
    // fundos para mandar áudio sem a declaração.
    const injetado = new MockAudioAiProvider();
    expect(getAudioAiProvider({ audio: injetado, retention: '30d' }).provider).toBeNull();
    expect(getAudioAiProvider({ audio: injetado, retention: 'ZERO' }).provider).toBe(injetado);
  });

  it('com ZERO, o padrão é o transcritor de mentira', () => {
    const { provider, reason } = getAudioAiProvider({ retention: 'ZERO' });
    expect(reason).toBeNull();
    expect(provider?.name).toBe('MOCK');
  });

  it('provider desconhecido não vira mock silenciosamente', () => {
    expect(getAudioAiProvider({ retention: 'ZERO', provider: 'whisper-de-alguem' })).toEqual({
      provider: null,
      reason: 'PROVIDER_UNKNOWN',
    });
  });
});

describe('transcritor de mentira', () => {
  it('devolve texto em pt-BR sem rede', async () => {
    const { text, language } = await new MockAudioAiProvider().transcribeAudio({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
    });
    expect(language).toBe('pt-BR');
    expect(text).toContain('apartamento');
  });

  it('recusa áudio vazio', async () => {
    await expect(
      new MockAudioAiProvider().transcribeAudio({
        audio: new Uint8Array(),
        mimeType: 'audio/webm',
      }),
    ).rejects.toThrow('Áudio vazio');
  });
});
