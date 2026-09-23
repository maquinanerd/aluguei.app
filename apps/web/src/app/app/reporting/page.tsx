import type { Metadata } from 'next';
import { ReportingClient } from './reporting-client';

export const metadata: Metadata = { title: 'Relatórios' };

export default function ReportingPage() {
  return <ReportingClient />;
}
