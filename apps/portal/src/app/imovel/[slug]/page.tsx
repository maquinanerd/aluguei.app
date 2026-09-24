import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ImovelCard } from '@/components/ImovelCard';
import { imovelDaApi } from '@/lib/adaptar';
import { Breadcrumb } from '@/components/Breadcrumb';
import { FormContato } from '@/components/FormContato';
import {
  AnuncianteInfo,
  AtributosImovel,
  AvisoIndisponivel,
  BlocoValor,
  CabecalhoAnuncio,
  Caracteristicas,
  ComparacaoMediana,
  DescricaoImovel,
  GaleriaImovel,
  LocalBairro,
} from '@/components/anuncio';
import { buscarAnuncio } from '@/lib/api';
import { caminhoDoAnuncio, cidadeLegivel, tipoDoDominio } from '@/lib/rotas';
import { TIPO_IMOVEL } from '@/lib/tipos';
import {
  descricaoDoAnuncio,
  jsonLdAnuncio,
  jsonLdTrilha,
  metadataDaPagina,
  tituloDoAnuncio,
} from '@/lib/seo';
interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resultado = await buscarAnuncio(slug);
  if (resultado.tipo !== 'ok') {
    // Anúncio fora do ar ou inexistente nunca entra no índice.
    return { title: 'Anúncio indisponível', robots: { index: false, follow: true } };
  }
  return metadataDaPagina({
    titulo: tituloDoAnuncio(resultado.listing),
    descricao: descricaoDoAnuncio(resultado.listing),
    caminho: caminhoDoAnuncio(resultado.canonicalSlug),
    robots: 'index, follow',
  });
}

export default async function AnuncioPage({ params }: Props) {
  const { slug } = await params;
  const resultado = await buscarAnuncio(slug);

  if (resultado.tipo === 'inexistente') {
    notFound();
  }
  if (resultado.tipo === 'movido') {
    // Rede de segurança: o 301 normalmente já veio do proxy, antes de renderizar.
    permanentRedirect(caminhoDoAnuncio(resultado.canonicalSlug));
  }
  if (resultado.tipo === 'removido') {
    return (
      <>
        <SiteHeader />
        <main className="pagina">
          <AvisoIndisponivel
            reason={resultado.reason}
            neighborhood={resultado.neighborhood}
            city={resultado.city}
          />
          {resultado.similar.length > 0 ? (
            <section aria-label="Imóveis parecidos">
              <h2 className="secao__titulo">Imóveis parecidos no bairro</h2>
              <div className="grade-cards">
                {resultado.similar.map((imovel) => (
                  <ImovelCard key={imovel.slug} imovel={imovelDaApi(imovel)} />
                ))}
              </div>
            </section>
          ) : null}
        </main>
        <SiteFooter />
      </>
    );
  }

  const { listing, similar } = resultado;
  const tipo = tipoDoDominio(listing.propertyType);
  const finalidade = listing.purpose === 'SALE' ? 'comprar' : 'alugar';
  const trilhos = [
    { rotulo: 'Início', href: '/' },
    { rotulo: finalidade === 'alugar' ? 'Alugar' : 'Comprar', href: `/${finalidade}` },
    ...(listing.citySlug === null
      ? []
      : [
          {
            rotulo: cidadeLegivel(listing.citySlug),
            href: `/${finalidade}/${listing.citySlug}`,
          },
        ]),
    ...(listing.citySlug !== null &&
    listing.neighborhoodSlug !== null &&
    listing.neighborhood !== null
      ? [
          {
            rotulo: listing.neighborhood,
            href: `/${finalidade}/${listing.citySlug}/${listing.neighborhoodSlug}`,
          },
        ]
      : []),
  ];

  return (
    <>
      <SiteHeader cor={tipo ?? 'acento'} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdTrilha([
              ...trilhos.map((t) => ({ nome: t.rotulo, caminho: t.href })),
              { nome: listing.title, caminho: caminhoDoAnuncio(listing.slug) },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdAnuncio(listing)) }}
      />

      <main className="pagina anuncio">
        <Breadcrumb
          trilhos={[
            ...trilhos.map((t) => ({ rotulo: t.rotulo, href: t.href })),
            { rotulo: tipo === null ? 'Anúncio' : TIPO_IMOVEL[tipo].nome },
          ]}
        />

        <GaleriaImovel listing={listing} />

        <div className="anuncio__corpo">
          <div className="anuncio__principal">
            <CabecalhoAnuncio listing={listing} />
            <AtributosImovel listing={listing} />
            <DescricaoImovel description={listing.description} />
            <Caracteristicas features={listing.features} />
            <LocalBairro listing={listing} />
            <ComparacaoMediana listing={listing} />
            <AnuncianteInfo listing={listing} />
          </div>

          <aside className="anuncio__lateral">
            <BlocoValor listing={listing} />
            <FormContato slug={listing.slug} />
          </aside>
        </div>

        {similar.length > 0 ? (
          <section aria-label="Outros imóveis no bairro">
            <h2 className="secao__titulo">Outros imóveis no bairro</h2>
            <div className="grade-cards">
              {similar.map((imovel) => (
                <ImovelCard key={imovel.slug} imovel={imovelDaApi(imovel)} variante="parecido" />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <div className="barra-contato-mobile">
        <span className="barra-contato-mobile__valor">
          {listing.purpose === 'SALE' ? 'À venda' : 'Total do mês'}
        </span>
        <a className="botao botao--acento" href="#contato-nome">
          Falar com a imobiliária
        </a>
      </div>

      <SiteFooter />
    </>
  );
}
