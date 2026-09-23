import type { Metadata } from 'next';
import { ContractsClient } from './contracts-client';

export const metadata: Metadata = { title: 'Contratos' };

export default function ContractsPage() {
  return <ContractsClient />;
}
