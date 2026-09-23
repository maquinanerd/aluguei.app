import type { Metadata } from 'next';
import { PropertyDetailClient } from './property-detail-client';

export const metadata: Metadata = { title: 'Imóvel' };

export default function PropertyDetailPage() {
  return <PropertyDetailClient />;
}
