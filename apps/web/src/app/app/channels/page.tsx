import type { Metadata } from 'next';
import { ChannelsClient } from './channels-client';

export const metadata: Metadata = { title: 'Canais | Aluguei.app' };

export default function ChannelsPage() {
  return <ChannelsClient />;
}
