import type { Metadata } from 'next';
import { MarketingClient } from './marketing-client';

export const metadata: Metadata = { title: 'Marketing | Aluguei.app' };

export default function MarketingPage() {
  return <MarketingClient />;
}
