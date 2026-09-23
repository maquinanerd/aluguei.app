import type { Metadata } from 'next';
import { ChargesClient } from './charges-client';

export const metadata: Metadata = { title: 'Cobranças' };

export default function ChargesPage() {
  return <ChargesClient />;
}
