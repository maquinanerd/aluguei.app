import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { responderAlerta } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Alerta confirmado',
  robots: { index: false, follow: true },
};

/** Confirmação do alerta pelo link de uso único que chegou no e-mail. */
export default async function AlertaConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const bruto = Array.isArray(query.token) ? query.token[0] : query.token;
  const resultado =
    bruto === undefined
      ? { ok: false as const }
      : await responderAlerta('confirm', bruto)
          .then(() => ({ ok: true as const }))
          .catch(() => ({ ok: false as const }));

  return (
    <>
      <SiteHeader />
      <main className="pagina pagina--estreita">
        {resultado.ok ? (
          <>
            <h1 className="pagina__titulo">Alerta confirmado</h1>
            <p>
              Pronto. Assim que aparecer um imóvel nesta busca, avisamos por onde você pediu. Dá
              para cancelar a qualquer momento pelo link de cada aviso.
            </p>
          </>
        ) : (
          <>
            <h1 className="pagina__titulo">Não deu para confirmar</h1>
            <p>
              O link já foi usado, expirou ou está incompleto. Crie o alerta de novo na página da
              busca que interessa.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
