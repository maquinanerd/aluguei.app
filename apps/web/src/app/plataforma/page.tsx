import type { Metadata } from 'next';
import { OverviewClient } from './overview-client';

export const metadata: Metadata = { title: 'Admin da plataforma | Aluguei.app' };
export const dynamic = 'force-dynamic';

export default function PlatformOverviewPage() {
  return <OverviewClient />;
}
