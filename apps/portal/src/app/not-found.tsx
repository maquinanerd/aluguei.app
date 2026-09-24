import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { EstadoVazio } from '@/components/EstadoVazio';

/** 404 do portal: nunca beco sem saída — leva de volta para a busca. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="pagina pagina--estreita">
        <EstadoVazio
          titulo="Esta página não existe"
          acao={
            <a className="botao botao--acento" href="/">
              Voltar para a busca
            </a>
          }
        >
          O endereço pode ter mudado, ou o imóvel que você procurava saiu do ar. O mapa do site
          lista tudo o que está disponível agora.
        </EstadoVazio>
        <p>
          <a href="/mapa-do-site">Ver o mapa do site</a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
