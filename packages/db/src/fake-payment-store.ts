import { and, eq, inArray } from 'drizzle-orm';
import type { AppDb } from './client.js';
import { fakeProviderCharges } from './schema/finance.js';

type FakeChargeStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';

interface FakeChargeRow {
  providerChargeId: string;
  amountCents: number;
  dueDate: string;
  status: FakeChargeStatus;
  externalReference: string | null;
}

/**
 * Estado do provider de pagamento FAKE em tabela. API e worker são processos
 * separados; com o estado em memória o worker nunca via a cobrança confirmada e
 * a stack integrada não liquidava pagamento (auditoria 2026-09-10, P1-13).
 * Estruturalmente compatível com `FakePaymentStore` (@aluguei/integrations).
 * Só para dev/E2E — nunca é usado com provider real.
 */
export function createDbFakePaymentStore(db: AppDb) {
  const toRow = (row: typeof fakeProviderCharges.$inferSelect): FakeChargeRow => ({
    providerChargeId: row.providerChargeId,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    status: row.status as FakeChargeStatus,
    externalReference: row.externalReference,
  });

  return {
    async insert(record: FakeChargeRow): Promise<void> {
      await db.insert(fakeProviderCharges).values(record);
    },

    async get(providerChargeId: string): Promise<FakeChargeRow | null> {
      const [row] = await db
        .select()
        .from(fakeProviderCharges)
        .where(eq(fakeProviderCharges.providerChargeId, providerChargeId))
        .limit(1);
      return row ? toRow(row) : null;
    },

    /** Troca de status condicional (compare-and-set). */
    async transition(
      providerChargeId: string,
      from: readonly FakeChargeStatus[],
      to: FakeChargeStatus,
    ): Promise<boolean> {
      const rows = await db
        .update(fakeProviderCharges)
        .set({ status: to, updatedAt: new Date() })
        .where(
          and(
            eq(fakeProviderCharges.providerChargeId, providerChargeId),
            inArray(fakeProviderCharges.status, [...from]),
          ),
        )
        .returning({ providerChargeId: fakeProviderCharges.providerChargeId });
      return rows.length === 1;
    },

    async list(): Promise<FakeChargeRow[]> {
      const rows = await db.select().from(fakeProviderCharges);
      return rows.map(toRow);
    },
  };
}
