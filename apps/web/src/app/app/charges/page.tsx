import type { Metadata } from 'next';
import { ChargesClient } from './charges-client';

export const metadata: Metadata = { title: 'Cobranças | Aluguei.app' };

export default function ChargesPage() {
  return <ChargesClient />;
}
