import type { Metadata } from 'next';
import { ListingsClient } from './listings-client';

export const metadata: Metadata = { title: 'Listings | Aluguei.app' };

export default function ListingsPage() {
  return <ListingsClient />;
}
