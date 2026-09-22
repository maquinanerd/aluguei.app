import type { Metadata } from 'next';
import { ContactDetailClient } from './contact-detail-client';

export const metadata: Metadata = { title: 'Contato | Aluguei.app' };

export default function ContactDetailPage() {
  return <ContactDetailClient />;
}
