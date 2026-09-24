import type { Metadata } from 'next';
import { PaginaDeBusca, metadataDaBusca } from '@/app/(busca)/busca-pagina';

interface Props {
  params: Promise<{ seg?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function paginaDe(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { seg } = await params;
  const query = await searchParams;
  return metadataDaBusca('alugar', seg, paginaDe(query.pagina));
}

export default async function AlugarPage({ params, searchParams }: Props) {
  const { seg } = await params;
  const query = await searchParams;
  return <PaginaDeBusca finalidade="alugar" segmentos={seg} pagina={paginaDe(query.pagina)} />;
}
