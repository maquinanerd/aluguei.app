import type { Metadata } from 'next';
import { ContractsClient } from './contracts-client';

export const metadata: Metadata = { title: 'Contratos | Aluguei.app' };

export default function ContractsPage() {
  return <ContractsClient />;
}
