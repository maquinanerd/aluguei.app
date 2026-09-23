import type { Metadata } from 'next';
import { ContractDetailClient } from './contract-detail-client';

export const metadata: Metadata = { title: 'Contrato' };

export default function ContractDetailPage() {
  return <ContractDetailClient />;
}
