import type { Metadata } from 'next';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = { title: 'Configurações' };

export default function SettingsPage() {
  return <SettingsClient />;
}
