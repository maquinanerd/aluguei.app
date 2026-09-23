import type { Metadata } from 'next';
import { VisitsClient } from './visits-client';

export const metadata: Metadata = { title: 'Visitas' };

export default function VisitsPage() {
  return <VisitsClient />;
}
