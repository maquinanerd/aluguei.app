import type { Metadata } from 'next';
import { ProposalsClient } from './proposals-client';

export const metadata: Metadata = { title: 'Propostas' };

export default function ProposalsPage() {
  return <ProposalsClient />;
}
