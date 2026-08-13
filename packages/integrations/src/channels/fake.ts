import { createHash } from 'node:crypto';
import { DomainError } from '@aluguei/domain';
import type {
  ChannelLeadInput,
  ChannelListingInput,
  ChannelPublishResult,
  ChannelReconcileResult,
  ChannelRemoveResult,
  ChannelValidationResult,
  IListingChannelAdapter,
} from './types.js';

const FAKE_LEADS: ChannelLeadInput[] = [
  {
    referenceId: 'fake-lead-001',
    channelListingId: null,
    name: 'Ana Souza',
    email: 'ana.souza@example.com',
    phone: '11987650001',
    message: 'Quero agendar uma visita',
    receivedAt: '2026-08-01T10:00:00.000Z',
  },
  {
    referenceId: 'fake-lead-002',
    channelListingId: null,
    name: 'Carlos Lima',
    email: 'carlos.lima@example.com',
    phone: '11987650002',
    message: 'O imóvel aceita pets?',
    receivedAt: '2026-08-01T11:00:00.000Z',
  },
];

/**
 * Adapter de referência (dev/test) — determinístico, sem rede, falhas injetáveis.
 * NUNCA representa endpoints de portais reais (Canal Pro/VivaReal/ZAP/OLX/Imovelweb).
 */
export class FakeChannel implements IListingChannelAdapter {
  readonly channel = 'fake' as const;
  readonly supportsImportLeads = true;

  private readonly store = new Map<
    string,
    { payload: ChannelListingInput; status: 'PUBLISHED' | 'REMOVED' }
  >();
  private failNextMethod: string | null = null;
  private failNextError: Error | null = null;

  constructor(private readonly log?: (msg: string) => void) {}

  reset(): void {
    this.store.clear();
    this.failNextMethod = null;
    this.failNextError = null;
  }

  /** Injeta falha na próxima chamada do método; depois volta ao normal (para testar retry). */
  failNext(method: string, error?: Error): void {
    this.failNextMethod = method;
    this.failNextError = error ?? new DomainError('NOT_FOUND', 'FakeChannel: falha injetada');
  }

  has(channelListingId: string): boolean {
    return this.store.has(channelListingId);
  }

  private maybeFail(method: string): void {
    if (this.failNextMethod === method) {
      const err = this.failNextError ?? new Error('FakeChannel: falha injetada');
      this.failNextMethod = null;
      this.failNextError = null;
      throw err;
    }
  }

  private static channelListingId(externalId: string): string {
    return `fake-${createHash('sha256').update(`fake:${externalId}`).digest('hex').slice(0, 10)}`;
  }

  validate(input: ChannelListingInput): Promise<ChannelValidationResult> {
    const errors: string[] = [];
    if (!input.title || input.title.trim().length === 0) {
      errors.push('title é obrigatório');
    }
    if (!input.monthlyRentCents || input.monthlyRentCents <= 0) {
      errors.push('monthlyRentCents deve ser positivo');
    }
    if (!input.publicAddress || !input.publicAddress.city) {
      errors.push('endereço público (cidade) é obrigatório');
    }
    return Promise.resolve({ valid: errors.length === 0, errors });
  }

  publish(input: ChannelListingInput): Promise<ChannelPublishResult> {
    this.maybeFail('publish');
    const channelListingId = FakeChannel.channelListingId(input.externalId);
    this.store.set(channelListingId, { payload: input, status: 'PUBLISHED' });
    this.log?.(`fake publish ${channelListingId}`);
    return Promise.resolve({
      channelListingId,
      status: 'PUBLISHED',
      url: `https://fake.example/${channelListingId}`,
    });
  }

  update(input: ChannelListingInput & { channelListingId: string }): Promise<ChannelPublishResult> {
    this.maybeFail('update');
    this.store.set(input.channelListingId, { payload: input, status: 'PUBLISHED' });
    this.log?.(`fake update ${input.channelListingId}`);
    return Promise.resolve({ channelListingId: input.channelListingId, status: 'PUBLISHED' });
  }

  remove(input: { channelListingId: string }): Promise<ChannelRemoveResult> {
    this.maybeFail('remove');
    this.store.delete(input.channelListingId); // remover inexistente = sucesso (idempotente)
    this.log?.(`fake remove ${input.channelListingId}`);
    return Promise.resolve({ status: 'REMOVED' });
  }

  reconcile(input: { channelListingId: string | null }): Promise<ChannelReconcileResult> {
    this.maybeFail('reconcile');
    if (input.channelListingId === null) {
      return Promise.resolve({ channelListingId: null, status: 'NOT_FOUND' });
    }
    const existing = this.store.get(input.channelListingId);
    if (!existing) {
      return Promise.resolve({ channelListingId: input.channelListingId, status: 'REMOVED' });
    }
    return Promise.resolve({ channelListingId: input.channelListingId, status: 'PUBLISHED' });
  }

  importLeads(input: { since?: string }): Promise<{ leads: ChannelLeadInput[] }> {
    this.maybeFail('importLeads');
    void input;
    return Promise.resolve({ leads: FAKE_LEADS.map((lead) => ({ ...lead })) });
  }
}
