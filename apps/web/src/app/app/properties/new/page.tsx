import type { Metadata } from 'next';
import { PropertyForm } from './property-form';

export const metadata: Metadata = { title: 'Novo imóvel | Aluguei.app' };

export default function NewPropertyPage() {
  return <PropertyForm />;
}
