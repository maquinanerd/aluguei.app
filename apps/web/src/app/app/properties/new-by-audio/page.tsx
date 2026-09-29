import type { Metadata } from 'next';
import { CadastroPorAudio } from './cadastro-por-audio';

export const metadata: Metadata = { title: 'Novo imóvel por áudio' };

export default function NovoImovelPorAudioPage() {
  return <CadastroPorAudio />;
}
