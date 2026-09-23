import type { Metadata } from 'next';
import { IntegrationsClient } from './integrations-client';

export const metadata: Metadata = { title: 'Integrações' };

export default function IntegrationsPage() {
  return <IntegrationsClient />;
}
