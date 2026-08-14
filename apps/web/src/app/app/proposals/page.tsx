import type { Metadata } from 'next';
import { ProposalsClient } from './proposals-client';

export const metadata: Metadata = { title: 'Propostas | Aluguei.app' };

export default function ProposalsPage() {
  return <ProposalsClient />;
}
