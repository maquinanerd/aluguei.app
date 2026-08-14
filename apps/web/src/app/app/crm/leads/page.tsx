import type { Metadata } from 'next';
import { LeadsClient } from './leads-client';

export const metadata: Metadata = { title: 'Leads | Aluguei.app' };

export default function LeadsPage() {
  return <LeadsClient />;
}
