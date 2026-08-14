import type { Metadata } from 'next';
import { InboxClient } from './inbox-client';

export const metadata: Metadata = { title: 'Inbox | Aluguei.app' };

export default function InboxPage() {
  return <InboxClient />;
}
