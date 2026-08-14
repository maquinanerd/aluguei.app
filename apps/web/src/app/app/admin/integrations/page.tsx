import type { Metadata } from 'next';
import { IntegrationsClient } from './integrations-client';

export const metadata: Metadata = { title: 'Integrações | Aluguei.app' };

export default function IntegrationsPage() {
  return <IntegrationsClient />;
}
