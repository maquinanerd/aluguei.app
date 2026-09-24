import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SearchHero } from '@/components/SearchHero';
import { ImovelCard } from '@/components/ImovelCard';
import { imovelDaApi } from '@/lib/adaptar';
import { MosaicoTipos } from '@/components/busca';
import { EstadoVazio } from '@/components/EstadoVazio';
import { buscarSitemap } from '@/lib/api';
import { cidadeLegivel } from '@/lib/rotas';
import { metadataDaPagina } from '@/lib/seo';
import { carregarHome } from './home-dados';

/**
 * Renderizada a cada requisição, de propósito: esta rota escreve **URL
 * absoluta** (canônica, sitemap, JSON-LD), e o endereço do portal vem do
 * ambiente do contêiner. Se a rota for gerada no `next build`, o endereço é
 * assado com o padrão de desenvolvimento e vai para produção como
 * `http://localhost:3100` — foi o que aconteceu na primeira implantação em
 * `achouimovel.online`. O custo é baixo: a chamada à API continua em cache por
 * tag (`src/lib/api.ts`).
 */
export const dynamic = 'force-dynamic';

/**
 * Home do portal. O HTML é genérico e fica em cache: o título e o campo de
 * cidade usam a cidade do visitante só como camada do cliente, por cima
 * (decisão 1 do prompt orquestrado). O que o Google lê é sempre o texto amplo.
 */
export const metadata: Metadata = metadataDaPagina({
  titulo: 'Ache onde morar, em qualquer cidade do Brasil',
  descricao:
    'Apartamentos, casas e studios para alugar ou comprar em todo o Brasil. O valor total do mês aparece antes de você clicar, e todo anúncio traz o CRECI de quem anuncia.',
  caminho: '/',
  robots: 'index, follow',
});

export default async function HomePage() {
  const { cidades, tipos, recentes } = await carregarHome();
  const sitemap = await buscarSitemap().catch(() => ({ pages: [], listings: [], agencies: [] }));
  const cidadesComEstoque = cidades.slice(0, 12);

  return (
    <>
      <SiteHeader />
      <main className="pagina">
        <section className="home-hero">
          <div>
            <h1 className="home-hero__titulo">Ache onde morar, em qualquer cidade do Brasil</h1>
            <p className="home-hero__texto">
              Apartamentos, casas e studios para alugar ou comprar. O valor total do mês aparece
              antes de você clicar, sem surpresa depois.
            </p>
          </div>
          <SearchHero cidades={cidadesComEstoque} cidadePadrao={null} />
        </section>

        <MosaicoTipos contagens={tipos} />

        {recentes.length > 0 ? (
          <section aria-label="Publicados recentemente">
            <h2 className="secao__titulo">Publicados recentemente</h2>
            <div className="grade-cards">
              {recentes.map((imovel) => (
                <ImovelCard key={imovel.slug} imovel={imovelDaApi(imovel)} />
              ))}
            </div>
          </section>
        ) : (
          <EstadoVazio titulo="Ainda não há anúncio publicado">
            As imobiliárias estão cadastrando os imóveis. Volte em breve.
          </EstadoVazio>
        )}

        {cidadesComEstoque.length > 0 ? (
          <section className="lista-filete" aria-label="Cidades com mais imóveis">
            <h2 className="secao__titulo">Cidades com mais imóveis</h2>
            <ul>
              {cidadesComEstoque.map((cidade) => (
                <li key={cidade.slug}>
                  <a href={`/alugar/${cidade.slug}`}>{cidade.nome}</a>
                  <span className="lista-filete__apoio">
                    {String(cidade.total)} {cidade.total === 1 ? 'imóvel' : 'imóveis'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sitemap.pages.length > 0 ? (
          <section className="lista-filete" aria-label="Buscas populares">
            <h2 className="secao__titulo">Buscas populares</h2>
            <ul>
              {sitemap.pages.slice(0, 10).map((pagina) => (
                <li key={pagina.path}>
                  <a href={pagina.path}>{descreverCaminho(pagina.path)}</a>
                  <span className="lista-filete__apoio">{String(pagina.count)} anúncios</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

/** "/alugar/goiania-go/setor-bueno" → "Alugar no Setor Bueno, Goiânia, GO". */
function descreverCaminho(caminho: string): string {
  const [, finalidade, cidade, bairro] = caminho.split('/');
  const acao = finalidade === 'comprar' ? 'Comprar' : 'Alugar';
  const onde = cidade === undefined ? '' : cidadeLegivel(cidade);
  if (bairro === undefined) {
    return `${acao} em ${onde}`;
  }
  const nomeBairro = bairro
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
  return `${acao} no ${nomeBairro}, ${onde}`;
}
