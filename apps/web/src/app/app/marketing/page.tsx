import type { Metadata } from 'next';
import { MarketingClient } from './marketing-client';

export const metadata: Metadata = { title: 'Marketing' };

export default function MarketingPage() {
  return <MarketingClient />;
}
