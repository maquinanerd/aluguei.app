import type { Metadata } from 'next';
import { ReconciliationClient } from './reconciliation-client';

export const metadata: Metadata = { title: 'Conciliação' };

export default function ReconciliationPage() {
  return <ReconciliationClient />;
}
