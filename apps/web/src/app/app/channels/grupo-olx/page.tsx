import type { Metadata } from 'next';
import { GrupoOlxClient } from './grupo-olx-client';

export const metadata: Metadata = { title: 'Grupo OLX' };

export default function GrupoOlxPage() {
  return <GrupoOlxClient />;
}
