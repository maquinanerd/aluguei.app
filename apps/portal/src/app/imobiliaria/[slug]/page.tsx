import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ImovelCard } from '@/components/ImovelCard';
import { imovelDaApi } from '@/lib/adaptar';
import { EstadoVazio } from '@/components/EstadoVazio';
import { buscarSitemap } from '@/lib/api';
import { metadataDaPagina, urlAbsoluta } from '@/lib/seo';
import { carregarVitrine } from './vitrine-dados';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const vitrine = await carregarVitrine(slug, 'RENT');
  if (vitrine === null) {
    return { title: 'Imobiliária não encontrada', robots: { index: false, follow: true } };
  }
  return metadataDaPagina({
    titulo: `${vitrine.nome} — imóveis para alugar e à venda`,
    descricao: `Imóveis anunciados por ${vitrine.nome}${
      vitrine.creci === null ? '' : ` (CRECI ${vitrine.creci})`
    } no AchouImóvel.`,
    caminho: `/imobiliaria/${slug}`,
    robots: vitrine.itens.length > 0 ? 'index, follow' : 'noindex, follow',
  });
}

/** Vitrine da imobiliária: nome, CRECI e os anúncios dela. */
export default async function VitrinePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const bruto = Array.isArray(query.finalidade) ? query.finalidade[0] : query.finalidade;
  const finalidade = bruto === 'comprar' ? 'SALE' : 'RENT';

  const vitrine = await carregarVitrine(slug, finalidade);
  if (vitrine === null) {
    notFound();
  }

  const noSitemap = await buscarSitemap().catch(() => ({ pages: [], listings: [], agencies: [] }));
  const existeNoPortal = noSitemap.agencies.some((a) => a.path === `/imobiliaria/${slug}`);

  return (
    <>
      <SiteHeader variante="b2b" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'RealEstateAgent',
            name: vitrine.nome,
            url: urlAbsoluta(`/imobiliaria/${slug}`),
            ...(vitrine.creci === null ? {} : { identifier: `CRECI ${vitrine.creci}` }),
            ...(vitrine.cidade === null
              ? {}
              : {
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'BR',
                    addressLocality: vitrine.cidade,
                    ...(vitrine.uf === null ? {} : { addressRegion: vitrine.uf }),
                  },
                }),
          }),
        }}
      />
      <main className="pagina">
        <header className="vitrine__cabecalho">
          <h1 className="pagina__titulo">{vitrine.nome}</h1>
          {vitrine.creci === null ? null : <p className="vitrine__creci">CRECI {vitrine.creci}</p>}
        </header>

        <nav className="vitrine__filtro" aria-label="Finalidade">
          <a
            href={`/imobiliaria/${slug}`}
            aria-current={finalidade === 'RENT' ? 'page' : undefined}
          >
            Para alugar
          </a>
          <a
            href={`/imobiliaria/${slug}?finalidade=comprar`}
            aria-current={finalidade === 'SALE' ? 'page' : undefined}
          >
            À venda
          </a>
        </nav>

        {vitrine.itens.length === 0 ? (
          <EstadoVazio titulo="Nenhum anúncio nesta finalidade">
            {existeNoPortal
              ? 'Esta imobiliária tem imóveis no portal, mas não nesta finalidade agora.'
              : 'Esta imobiliária ainda não publicou anúncios no portal.'}
          </EstadoVazio>
        ) : (
          <div className="grade-cards">
            {vitrine.itens.map((imovel) => (
              <ImovelCard key={imovel.slug} imovel={imovelDaApi(imovel)} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
