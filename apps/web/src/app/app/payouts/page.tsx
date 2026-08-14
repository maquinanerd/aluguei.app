import type { Metadata } from 'next';
import { PayoutsClient } from './payouts-client';

export const metadata: Metadata = { title: 'Repasses | Aluguei.app' };

export default function PayoutsPage() {
  return <PayoutsClient />;
}
