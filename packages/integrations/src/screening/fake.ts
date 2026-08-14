import { createHash } from 'node:crypto';
import type { CreditScreeningInput, IScreeningProvider, ScreeningProviderResult } from './types.js';

export interface FakeScreeningProviderOptions {
  /** Força red flag HIGH para um CPF específico (testes). */
  highRiskCpf?: string;
  /** Força score baixo para um CPF específico (testes). */
  lowScoreCpf?: string;
}

/**
 * Provider mock determinístico: score estável por hash do CPF (300–900),
 * red flags configuráveis. Sem rede. NUNCA usado em produção sem provider explícito.
 */
export class FakeScreeningProvider implements IScreeningProvider {
  constructor(private readonly opts: FakeScreeningProviderOptions = {}) {}

  requestCreditScreening(input: CreditScreeningInput): Promise<ScreeningProviderResult> {
    const normalized = input.cpf.replace(/\D/g, '');
    const hash = createHash('sha256').update(`screening:${normalized}`).digest();
    const score = 300 + ((hash[0] ?? 0) / 255) * 600;

    const redFlags: ScreeningProviderResult['redFlags'] = [];
    if (this.opts.highRiskCpf && normalized === this.opts.highRiskCpf.replace(/\D/g, '')) {
      redFlags.push({
        id: 'NEGATIVACAO_ALTA',
        severity: 'HIGH',
        detail: 'Negativação de alto valor',
      });
    }
    if (this.opts.lowScoreCpf && normalized === this.opts.lowScoreCpf.replace(/\D/g, '')) {
      redFlags.push({ id: 'SCORE_BAIXO', severity: 'MEDIUM', detail: 'Score abaixo do mínimo' });
    }

    return Promise.resolve({
      score: Math.round(score),
      redFlags,
      summary: { provider: 'fake', cpfHash: hash.subarray(0, 6).toString('hex') },
    });
  }
}
