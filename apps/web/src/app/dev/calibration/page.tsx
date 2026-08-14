import type { Metadata } from 'next';
import { Breadcrumb } from '@aluguei/ui';
import { Calibration } from './calibration-client';

export const metadata: Metadata = { title: 'Calibração | Aluguei.app' };

const crumbs = [
  { label: 'Aluguei', href: '/' },
  { label: 'Desenvolvimento' },
  { label: 'Calibração' },
];

export default function CalibrationPage() {
  return (
    <main style={{ padding: 24 }}>
      <Breadcrumb items={crumbs} />
      <Calibration />
    </main>
  );
}
