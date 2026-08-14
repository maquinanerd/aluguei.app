import type { Metadata } from 'next';
import { LeadDetailClient } from './lead-detail-client';

export const metadata: Metadata = { title: 'Lead | Aluguei.app' };

export default function LeadDetailPage() {
  return <LeadDetailClient />;
}
