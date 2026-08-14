import type { Metadata } from 'next';
import { ContractTemplatesClient } from './templates-client';

export const metadata: Metadata = { title: 'Templates de contrato | Aluguei.app' };

export default function ContractTemplatesPage() {
  return <ContractTemplatesClient />;
}
