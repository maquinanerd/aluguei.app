import type { Metadata } from 'next';
import { ContactsClient } from './contacts-client';

export const metadata: Metadata = { title: 'Contatos' };

export default function ContactsPage() {
  return <ContactsClient />;
}
