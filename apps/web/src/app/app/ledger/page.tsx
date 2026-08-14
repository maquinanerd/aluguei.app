import type { Metadata } from 'next';
import { LedgerClient } from './ledger-client';

export const metadata: Metadata = { title: 'Ledger | Aluguei.app' };

export default function LedgerPage() {
  return <LedgerClient />;
}
