import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Catalogo } from './catalogo-client';
import './catalogo.css';

export const metadata: Metadata = {
  title: 'Identidade e componentes do portal · AchouImóvel',
};

/**
 * Tela 01 da rodada de fidelidade: a identidade do portal com os componentes base e todos os
 * estados. Fora do ar em produção, pelo mesmo precedente de `/dev/calibration` no painel e das
 * rotas `/dev` da API: página de desenvolvimento não fica pública.
 */
export default function ComponentesPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <Catalogo />;
}
