import type { Metadata } from 'next';
import { PropertiesClient } from './properties-client';

export const metadata: Metadata = { title: 'Imóveis | Aluguei.app' };

export default function PropertiesPage() {
  return <PropertiesClient />;
}
