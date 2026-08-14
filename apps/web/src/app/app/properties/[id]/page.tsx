import type { Metadata } from 'next';
import { PropertyDetailClient } from './property-detail-client';

export const metadata: Metadata = { title: 'Imóvel | Aluguei.app' };

export default function PropertyDetailPage() {
  return <PropertyDetailClient />;
}
