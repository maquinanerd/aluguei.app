import type { Metadata } from 'next';
import { PlansClient } from './plans-client';

export const metadata: Metadata = { title: 'Planos | Admin da plataforma' };
export const dynamic = 'force-dynamic';

export default function PlansPage() {
  return <PlansClient />;
}
