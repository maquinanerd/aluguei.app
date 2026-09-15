import { createHash } from 'node:crypto';
import type {
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  EnvelopeStatus,
  ISignatureProvider,
  SignatureProviderName,
} from './types.js';

/** Provider mock de assinatura: envelope id determinístico por contractId. */
export class FakeSignatureProvider implements ISignatureProvider {
  readonly name: SignatureProviderName = 'FAKE';
  private readonly statuses = new Map<string, EnvelopeStatus>();

  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult> {
    const providerEnvelopeId = `env.fake.${createHash('sha256').update(input.contractId).digest('hex').slice(0, 12)}`;
    this.statuses.set(providerEnvelopeId, 'SENT');
    return Promise.resolve({ providerEnvelopeId });
  }

  getStatus(providerEnvelopeId: string): Promise<EnvelopeStatus> {
    return Promise.resolve(this.statuses.get(providerEnvelopeId) ?? 'SENT');
  }
}
