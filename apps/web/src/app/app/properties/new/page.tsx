import type { Metadata } from 'next';
import { PropertyForm } from './property-form';

export const metadata: Metadata = { title: 'Novo imóvel' };

export default function NewPropertyPage() {
  return <PropertyForm />;
}
