import type { Metadata } from 'next';
import { InspectionDetailClient } from './inspection-detail-client';

export const metadata: Metadata = { title: 'Vistoria | Aluguei.app' };

export default function InspectionDetailPage() {
  return <InspectionDetailClient />;
}
