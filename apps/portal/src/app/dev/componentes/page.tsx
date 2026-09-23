import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Catalogo } from './catalogo-client';

export const metadata: Metadata = {
  title: 'Componentes do portal · AchouImóvel',
};

/**
 * Catálogo dos componentes base do portal com todos os estados (Onda 1B).
 * Fora do ar em produção, pelo mesmo precedente de `/dev/calibration` no painel
 * e das rotas `/dev` da API: página de desenvolvimento não fica pública.
 */
export default function ComponentesPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <Catalogo />;
}
