import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { ledgerAccounts, ledgerEntries } from '@aluguei/db';
import { DomainError } from '@aluguei/domain';

/** Garante as contas de ledger padrão da org. */
export async function ensureDefaultLedgerAccounts(db: AppDb, orgId: string): Promise<void> {
  const defaults = [
    { code: 'CASH', name: 'Caixa', type: 'ASSET' },
    { code: 'AR_RECEIVABLE', name: 'Contas a Receber', type: 'ASSET' },
    { code: 'AGENCY_FEE_REVENUE', name: 'Receita de Comissão', type: 'REVENUE' },
    { code: 'LANDLORD_PAYABLE', name: 'A Pagar ao Proprietário', type: 'LIABILITY' },
  ] as const;
  for (const account of defaults) {
    await db
      .insert(ledgerAccounts)
      .values({ orgId, ...account })
      .onConflictDoNothing();
  }
}

async function accountIdByCode(db: AppDb, orgId: string, code: string): Promise<string> {
  const [account] = await db
    .select()
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.orgId, orgId), eq(ledgerAccounts.code, code)))
    .limit(1);
  if (!account) {
    throw new DomainError('NOT_FOUND', `Conta de ledger não encontrada: ${code}`);
  }
  return account.id;
}

/**
 * Grava um grupo de entradas balanceadas (soma = 0) numa transação DB.
 * DEBIT = amount positivo; CREDIT = negativo. Idempotente (UNIQUE transaction+account).
 */
export async function postLedgerTransaction(
  db: AppDb,
  orgId: string,
  transactionId: string,
  referenceType: string,
  referenceId: string,
  entries: Array<{ code: string; amountCents: number }>,
): Promise<void> {
  await ensureDefaultLedgerAccounts(db, orgId);
  const balance = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
  if (balance !== 0) {
    throw new DomainError('INVALID_INPUT', 'Transação de ledger desbalanceada');
  }
  for (const entry of entries) {
    const accountId = await accountIdByCode(db, orgId, entry.code);
    await db
      .insert(ledgerEntries)
      .values({
        orgId,
        transactionId,
        accountId,
        amountCents: entry.amountCents,
        entryType: entry.amountCents > 0 ? 'DEBIT' : 'CREDIT',
        referenceType,
        referenceId,
      })
      .onConflictDoNothing();
  }
}
