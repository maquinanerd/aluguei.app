import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '@aluguei/db';
import { ledgerAccounts, ledgerEntries } from '@aluguei/db';
import { DomainError } from '@aluguei/domain';

export const LEDGER_ACCOUNTS = [
  { code: 'CASH', name: 'Caixa', type: 'ASSET' },
  { code: 'AR_RECEIVABLE', name: 'Contas a Receber', type: 'ASSET' },
  { code: 'AGENCY_FEE_REVENUE', name: 'Receita de Comissão', type: 'REVENUE' },
  { code: 'LANDLORD_PAYABLE', name: 'A Pagar ao Proprietário', type: 'LIABILITY' },
  { code: 'UNAPPLIED_RECEIPTS', name: 'Recebimentos não aplicados', type: 'LIABILITY' },
  {
    code: 'LANDLORD_CLAWBACK_RECEIVABLE',
    name: 'A Recuperar do Proprietário (estorno)',
    type: 'ASSET',
  },
] as const;

export type LedgerAccountCode = (typeof LEDGER_ACCOUNTS)[number]['code'];

export interface LedgerLeg {
  code: LedgerAccountCode;
  /** DEBIT positivo, CREDIT negativo. */
  amountCents: number;
}

export interface LedgerPosting {
  orgId: string;
  /**
   * Chave da operação de negócio (ex.: `PAYMENT:<paymentId>`): a mesma chave
   * nunca gera um segundo lançamento — nem repetida, nem concorrente.
   */
  businessKey: string;
  referenceType: string;
  referenceId: string;
  legs: LedgerLeg[];
  description?: string;
}

/** Garante as contas de ledger padrão da org. */
export async function ensureDefaultLedgerAccounts(db: DbExecutor, orgId: string): Promise<void> {
  await db
    .insert(ledgerAccounts)
    .values(LEDGER_ACCOUNTS.map((account) => ({ orgId, ...account })))
    .onConflictDoNothing();
}

/** UUID determinístico (v8, RFC 9562): a mesma operação lógica gera o mesmo id. */
export function deterministicUuid(name: string): string {
  const bytes = createHash('sha256').update(name).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Grava uma transação contábil balanceada (Σ = 0; débito positivo, crédito
 * negativo). Idempotente pela chave de negócio: o `transaction_id` deriva de
 * (org, chave) e o banco tem UNIQUE (org_id, business_key, account_id) — numa
 * corrida o segundo INSERT falha e desfaz a transação do chamador. Deve rodar
 * dentro da transação (`tx`) da mudança de estado que a originou, para que
 * estado e razão nunca divirjam (auditoria 2026-09-10, P0-01).
 */
export async function postLedgerTransaction(
  db: DbExecutor,
  posting: LedgerPosting,
): Promise<{ transactionId: string; posted: boolean }> {
  const legs = posting.legs.filter((leg) => leg.amountCents !== 0);
  if (legs.some((leg) => !Number.isSafeInteger(leg.amountCents))) {
    throw new DomainError('INVALID_INPUT', 'Lançamento contábil com valor inválido');
  }
  if (legs.reduce((sum, leg) => sum + leg.amountCents, 0) !== 0) {
    throw new DomainError('INVALID_INPUT', 'Transação de ledger desbalanceada');
  }
  if (new Set(legs.map((leg) => leg.code)).size !== legs.length) {
    throw new DomainError('INVALID_INPUT', 'Transação de ledger com conta repetida');
  }
  const transactionId = deterministicUuid(`ledger:${posting.orgId}:${posting.businessKey}`);
  if (legs.length === 0) {
    return { transactionId, posted: false };
  }
  const [existing] = await db
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.orgId, posting.orgId),
        eq(ledgerEntries.businessKey, posting.businessKey),
      ),
    )
    .limit(1);
  if (existing) {
    return { transactionId, posted: false };
  }
  await ensureDefaultLedgerAccounts(db, posting.orgId);
  const accounts = await db
    .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
    .from(ledgerAccounts)
    .where(
      and(
        eq(ledgerAccounts.orgId, posting.orgId),
        inArray(
          ledgerAccounts.code,
          legs.map((leg) => leg.code),
        ),
      ),
    );
  const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
  await db.insert(ledgerEntries).values(
    legs.map((leg) => {
      const accountId = accountIdByCode.get(leg.code);
      if (!accountId) {
        throw new DomainError('NOT_FOUND', `Conta de ledger não encontrada: ${leg.code}`);
      }
      return {
        orgId: posting.orgId,
        transactionId,
        accountId,
        amountCents: leg.amountCents,
        entryType: leg.amountCents > 0 ? 'DEBIT' : 'CREDIT',
        referenceType: posting.referenceType,
        referenceId: posting.referenceId,
        businessKey: posting.businessKey,
        description: posting.description ?? null,
      };
    }),
  );
  return { transactionId, posted: true };
}

/** Saldo por conta do que já foi lançado para uma referência (ex.: uma cobrança). */
export async function balancesByAccount(
  db: DbExecutor,
  orgId: string,
  referenceTypes: string[],
  referenceId: string,
): Promise<Map<LedgerAccountCode, number>> {
  const rows = await db
    .select({ code: ledgerAccounts.code, amountCents: ledgerEntries.amountCents })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(
      and(
        eq(ledgerEntries.orgId, orgId),
        inArray(ledgerEntries.referenceType, referenceTypes),
        eq(ledgerEntries.referenceId, referenceId),
      ),
    );
  const balances = new Map<LedgerAccountCode, number>();
  for (const row of rows) {
    const code = row.code as LedgerAccountCode;
    balances.set(code, (balances.get(code) ?? 0) + row.amountCents);
  }
  return balances;
}
