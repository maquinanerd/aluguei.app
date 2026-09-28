import type { Metadata } from 'next';
import { NegociacoesClient } from './negociacoes-client';

export const metadata: Metadata = { title: 'Negociações' };

export default function NegociacoesPage() {
  return <NegociacoesClient />;
}
