import type { Metadata } from 'next';
import { ReconciliationClient } from './reconciliation-client';

export const metadata: Metadata = { title: 'Conciliação | Aluguei.app' };

export default function ReconciliationPage() {
  return <ReconciliationClient />;
}
