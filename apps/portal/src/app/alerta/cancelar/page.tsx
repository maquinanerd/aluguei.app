import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CancelarAlerta } from './cancelar-alerta';

export const metadata: Metadata = {
  title: 'Cancelar alerta',
  robots: { index: false, follow: true },
};

/**
 * Cancelamento do alerta pelo mesmo link de uso único. Abrir o link só pergunta: o cancelamento é
 * do botão (Onda 0 da rodada de fidelidade, defeito 8).
 */
export default async function AlertaCancelarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const token = Array.isArray(query.token) ? query.token[0] : query.token;

  return (
    <>
      <SiteHeader />
      <main className="pagina pagina--estreita">
        {token === undefined || token.trim() === '' ? (
          <>
            <h1 className="pagina__titulo">Não deu para abrir o cancelamento</h1>
            <p>
              O link está incompleto. Abra de novo pelo link do e-mail; se continuar recebendo
              aviso, fale com a gente.
            </p>
          </>
        ) : (
          <CancelarAlerta token={token} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
