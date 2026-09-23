import type { Metadata } from 'next';
import { InspectionsClient } from './inspections-client';

export const metadata: Metadata = { title: 'Vistorias' };

export default function InspectionsPage() {
  return <InspectionsClient />;
}
