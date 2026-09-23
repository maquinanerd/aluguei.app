import type { Metadata } from 'next';
import { PaymentsClient } from './payments-client';

export const metadata: Metadata = { title: 'Pagamentos' };

export default function PaymentsPage() {
  return <PaymentsClient />;
}
