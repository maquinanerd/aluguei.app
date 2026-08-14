import type { Metadata } from 'next';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = { title: 'Configurações | Aluguei.app' };

export default function SettingsPage() {
  return <SettingsClient />;
}
