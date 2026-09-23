import type { Metadata } from 'next';
import { ContactDetailClient } from './contact-detail-client';

export const metadata: Metadata = { title: 'Contato' };

export default function ContactDetailPage() {
  return <ContactDetailClient />;
}
