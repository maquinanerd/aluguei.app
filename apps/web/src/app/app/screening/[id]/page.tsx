import type { Metadata } from 'next';
import { ScreeningDetailClient } from './screening-detail-client';

export const metadata: Metadata = { title: 'Análise de crédito' };

export default function ScreeningDetailPage() {
  return <ScreeningDetailClient />;
}
