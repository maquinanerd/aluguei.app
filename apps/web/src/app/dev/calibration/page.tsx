import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@aluguei/ui';
import { Calibration } from './calibration-client';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Calibração' };

const crumbs = [
  { label: BRAND.name, href: '/' },
  { label: 'Desenvolvimento' },
  { label: 'Calibração' },
];

/**
 * Calibração visual com dados fictícios. Só existe fora de produção — mesmo
 * critério da API, que só registra rotas `/dev` fora de produção (auditoria
 * 2026-09-10, P3: a página respondia sem login em produção).
 */
export default function CalibrationPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return (
    <main style={{ padding: 24 }}>
      <Breadcrumb items={crumbs} />
      <Calibration />
    </main>
  );
}
