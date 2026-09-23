import type { Metadata } from 'next';
import { ContractTemplatesClient } from './templates-client';

export const metadata: Metadata = { title: 'Templates de contrato' };

export default function ContractTemplatesPage() {
  return <ContractTemplatesClient />;
}
