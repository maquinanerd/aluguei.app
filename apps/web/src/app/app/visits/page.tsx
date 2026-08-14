import type { Metadata } from 'next';
import { VisitsClient } from './visits-client';

export const metadata: Metadata = { title: 'Visitas | Aluguei.app' };

export default function VisitsPage() {
  return <VisitsClient />;
}
