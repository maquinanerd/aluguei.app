import type { Metadata } from 'next';
import { LeasesClient } from './leases-client';

export const metadata: Metadata = { title: 'Locações | Aluguei.app' };

export default function LeasesPage() {
  return <LeasesClient />;
}
