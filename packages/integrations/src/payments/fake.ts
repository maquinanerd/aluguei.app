import { randomUUID } from 'node:crypto';
import type {
  CreateChargeInput,
  CreateChargeResult,
  IPaymentProvider,
  PaymentChargeStatus,
} from './types.js';

export interface FakeChargeRecord {
  providerChargeId: string;
  amountCents: number;
  dueDate: string;
  status: PaymentChargeStatus;
  externalReference: string | null;
}

/**
 * Estado do provider FAKE. Em memória por padrão (testes in-process); em
 * dev/E2E a API e o worker são processos separados e usam a implementação em
 * tabela (`createDbFakePaymentStore`, @aluguei/db) para enxergarem o mesmo
 * estado (auditoria 2026-09-10, P1-13).
 */
export interface FakePaymentStore {
  insert(record: FakeChargeRecord): Promise<void>;
  get(providerChargeId: string): Promise<FakeChargeRecord | null>;
  /** Troca de status condicional (compare-and-set): true se estava em `from`. */
  transition(
    providerChargeId: string,
    from: readonly PaymentChargeStatus[],
    to: PaymentChargeStatus,
  ): Promise<boolean>;
  list(): Promise<FakeChargeRecord[]>;
}

export class InMemoryFakePaymentStore implements FakePaymentStore {
  private readonly records = new Map<string, FakeChargeRecord>();

  insert(record: FakeChargeRecord): Promise<void> {
    this.records.set(record.providerChargeId, { ...record });
    return Promise.resolve();
  }

  get(providerChargeId: string): Promise<FakeChargeRecord | null> {
    const record = this.records.get(providerChargeId);
    return Promise.resolve(record ? { ...record } : null);
  }

  transition(
    providerChargeId: string,
    from: readonly PaymentChargeStatus[],
    to: PaymentChargeStatus,
  ): Promise<boolean> {
    const record = this.records.get(providerChargeId);
    if (!record || !from.includes(record.status)) {
      return Promise.resolve(false);
    }
    record.status = to;
    return Promise.resolve(true);
  }

  list(): Promise<FakeChargeRecord[]> {
    return Promise.resolve([...this.records.values()].map((record) => ({ ...record })));
  }
}

/**
 * Provider mock de pagamento. O id é único por cobrança (o hash de
 * valor+vencimento colidia entre cobranças e organizações) e as transições
 * imitam um provider real: só se estorna o que foi pago, não se cancela o que
 * já foi pago e o estado só muda por ação "do provider" — nenhum webhook
 * confirma ou estorna nada por conta própria (auditoria 2026-09-10, P0-02).
 */
export class FakePaymentProvider implements IPaymentProvider {
  readonly name = 'FAKE';

  constructor(private readonly store: FakePaymentStore = new InMemoryFakePaymentStore()) {}

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const providerChargeId = `pc.fake.${randomUUID()}`;
    await this.store.insert({
      providerChargeId,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      status: 'PENDING',
      externalReference: input.externalReference ?? null,
    });
    return {
      providerChargeId,
      pixQrCode: `00020126580014BR.GOV.BCB.PIX0136fake-${providerChargeId}5204000053039865802BR`,
      boletoUrl: `https://fake-bank.example/boleto/${providerChargeId}`,
    };
  }

  async getChargeStatus(providerChargeId: string): Promise<PaymentChargeStatus> {
    return (await this.store.get(providerChargeId))?.status ?? 'PENDING';
  }

  /**
   * Simula o pagador quitando a cobrança. Aceita cobrança cancelada (FAILED):
   * um QR/boleto antigo ainda pode ser pago e o sistema precisa registrar.
   */
  async confirmCharge(providerChargeId: string): Promise<void> {
    if (await this.store.transition(providerChargeId, ['PENDING', 'FAILED'], 'CONFIRMED')) {
      return;
    }
    const current = await this.store.get(providerChargeId);
    if (current?.status === 'CONFIRMED') {
      return;
    }
    throw new Error(
      `FAKE: cobrança ${providerChargeId} não pode ser confirmada (${current?.status ?? 'inexistente'})`,
    );
  }

  async cancelCharge(providerChargeId: string): Promise<void> {
    if (await this.store.transition(providerChargeId, ['PENDING'], 'FAILED')) {
      return;
    }
    const current = await this.store.get(providerChargeId);
    if (!current || current.status === 'FAILED') {
      return;
    }
    throw new Error(
      `FAKE: cobrança ${providerChargeId} já ${current.status === 'CONFIRMED' ? 'paga' : 'estornada'} — não pode ser cancelada`,
    );
  }

  async refundPayment(providerPaymentId: string): Promise<void> {
    if (await this.store.transition(providerPaymentId, ['CONFIRMED'], 'REFUNDED')) {
      return;
    }
    const current = await this.store.get(providerPaymentId);
    if (current?.status === 'REFUNDED') {
      return;
    }
    throw new Error(
      `FAKE: só é possível estornar cobrança paga (${current?.status ?? 'inexistente'})`,
    );
  }

  /** Para a conciliação: cobranças conhecidas pelo provider. */
  async getProviderCharges(): Promise<
    Array<{ id: string; amountCents: number; status: PaymentChargeStatus }>
  > {
    return (await this.store.list()).map((record) => ({
      id: record.providerChargeId,
      amountCents: record.amountCents,
      status: record.status,
    }));
  }
}
