import type { Metadata } from 'next';
import { FinanceClient } from './finance-client';

export const metadata: Metadata = { title: 'Financeiro' };

export default function FinancePage() {
  return <FinanceClient />;
}
