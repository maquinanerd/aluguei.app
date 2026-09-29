/**
 * Transcrição de áudio para o cadastro por voz (ADR-104).
 *
 * A regra que mora aqui: **áudio bruto só sai para provedor declarado sem
 * retenção e sem treinamento.** A declaração é configuração explícita
 * (`AI_AUDIO_RETENTION=ZERO`); sem ela o recurso fica desligado e a tela diz
 * isso. Falha fechada de propósito — um provedor que guarda áudio guarda a voz
 * do corretor e o que ele disser por perto, e isso não se desfaz depois.
 *
 * Transcrever é uma capacidade separada de `AiProvider` porque nem todo
 * provider de texto transcreve; quem não transcreve simplesmente não é
 * oferecido aqui.
 */

export interface AudioTranscription {
  text: string;
  /** Código BCP-47 do que o provider reconheceu. */
  language: string;
}

export interface AudioAiProvider {
  /** Nome do provider, para a tela poder avisar quando for simulação. */
  readonly name: string;
  transcribeAudio(input: { audio: Uint8Array; mimeType: string }): Promise<AudioTranscription>;
}

/**
 * Transcritor de mentira para desenvolvimento e teste: devolve sempre o mesmo
 * texto, sem rede. Não pretende parecer real — o nome sai em `/capabilities` e
 * a tela avisa que é simulação, como no pagamento FAKE.
 */
export class MockAudioAiProvider implements AudioAiProvider {
  readonly name = 'MOCK';

  private readonly texto: string;

  constructor(texto?: string) {
    this.texto =
      texto ??
      'Esse aqui é um apartamento pra alugar no Setor Bueno, tem dois quartos, ' +
        'uma vaga, uns setenta e dois metros quadrados. O aluguel é dois mil e trezentos, ' +
        'condomínio quatrocentos e oitenta mais ou menos. Aceita pet, não é mobiliado.';
  }

  transcribeAudio(input: { audio: Uint8Array; mimeType: string }): Promise<AudioTranscription> {
    if (input.audio.byteLength === 0) {
      return Promise.reject(new Error('Áudio vazio'));
    }
    return Promise.resolve({ text: this.texto, language: 'pt-BR' });
  }
}

export interface AudioAiRegistryOptions {
  /** `AI_AUDIO_RETENTION`: só `ZERO` liga o recurso. */
  retention?: string | undefined;
  /** `AI_AUDIO_PROVIDER`: `mock` (padrão) — provedores reais entram quando houver contrato. */
  provider?: string | undefined;
  /** Override injetado (teste/dev) — tem prioridade máxima. */
  audio?: AudioAiProvider | undefined;
}

/** Motivo pelo qual o recurso está desligado, para a tela poder explicar. */
export type AudioAiUnavailable = 'RETENTION_NOT_DECLARED' | 'PROVIDER_UNKNOWN';

export interface AudioAiResolution {
  provider: AudioAiProvider | null;
  reason: AudioAiUnavailable | null;
}

/**
 * Resolve o transcritor. Sem `retention === 'ZERO'` devolve `null`: é a trava
 * do ADR-104, e ela mora no registro justamente para que nenhuma rota consiga
 * esquecer de checá-la.
 */
export function getAudioAiProvider(opts: AudioAiRegistryOptions = {}): AudioAiResolution {
  const retention = opts.retention ?? process.env.AI_AUDIO_RETENTION;
  if (retention !== 'ZERO') {
    return { provider: null, reason: 'RETENTION_NOT_DECLARED' };
  }
  if (opts.audio) {
    return { provider: opts.audio, reason: null };
  }
  const provider = opts.provider ?? process.env.AI_AUDIO_PROVIDER ?? 'mock';
  if (provider === 'mock') {
    return { provider: new MockAudioAiProvider(), reason: null };
  }
  return { provider: null, reason: 'PROVIDER_UNKNOWN' };
}
