import type { Metadata } from 'next';
import { LeaseDetailClient } from './lease-detail-client';

export const metadata: Metadata = { title: 'Locação | Aluguei.app' };

export default function LeaseDetailPage() {
  return <LeaseDetailClient />;
}
