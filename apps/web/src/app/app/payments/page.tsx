import type { Metadata } from 'next';
import { PaymentsClient } from './payments-client';

export const metadata: Metadata = { title: 'Pagamentos | Aluguei.app' };

export default function PaymentsPage() {
  return <PaymentsClient />;
}
