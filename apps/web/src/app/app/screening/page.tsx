import type { Metadata } from 'next';
import { ScreeningClient } from './screening-client';

export const metadata: Metadata = { title: 'Crédito' };

export default function ScreeningPage() {
  return <ScreeningClient />;
}
