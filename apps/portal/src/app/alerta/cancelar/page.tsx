import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { responderAlerta } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Alerta cancelado',
  robots: { index: false, follow: true },
};

/** Cancelamento do alerta pelo mesmo link de uso único. */
export default async function AlertaCanceladoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const bruto = Array.isArray(query.token) ? query.token[0] : query.token;
  const resultado =
    bruto === undefined
      ? { ok: false as const }
      : await responderAlerta('cancel', bruto)
          .then(() => ({ ok: true as const }))
          .catch(() => ({ ok: false as const }));

  return (
    <>
      <SiteHeader />
      <main className="pagina pagina--estreita">
        {resultado.ok ? (
          <>
            <h1 className="pagina__titulo">Alerta cancelado</h1>
            <p>
              Você não recebe mais aviso desta busca. Se mudar de ideia, dá para criar o alerta de
              novo na página da busca.
            </p>
          </>
        ) : (
          <>
            <h1 className="pagina__titulo">Não deu para cancelar</h1>
            <p>
              O link já foi usado ou está incompleto. Se continuar recebendo aviso, fale com a
              gente.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
