import type { Metadata } from 'next';
import { FinanceClient } from './finance-client';

export const metadata: Metadata = { title: 'Financeiro | Aluguei.app' };

export default function FinancePage() {
  return <FinanceClient />;
}
