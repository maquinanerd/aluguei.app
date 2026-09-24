import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { EstadoVazio } from '@/components/EstadoVazio';
import { buscarSitemap } from '@/lib/api';
import { cidadeLegivel, lugarLegivel } from '@/lib/rotas';
import { metadataDaPagina } from '@/lib/seo';

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

export const metadata: Metadata = metadataDaPagina({
  titulo: 'Mapa do site',
  descricao:
    'Todas as buscas do AchouImóvel com imóvel disponível, organizadas por estado e cidade.',
  caminho: '/mapa-do-site',
  robots: 'index, follow',
});

interface CidadeDoMapa {
  path: string;
  count: number;
  bairros: { path: string; nome: string }[];
}

interface Grupo {
  uf: string;
  cidades: Map<string, CidadeDoMapa>;
}

/**
 * Mapa do site: a porta de entrada do rastreamento. Lista só o que pode ser
 * indexado — a API já aplica o limiar (ADR-099).
 */
export default async function MapaDoSitePage() {
  const dados = await buscarSitemap().catch(() => ({ pages: [], listings: [], agencies: [] }));

  const porUf = new Map<string, Grupo>();
  for (const pagina of dados.pages) {
    const partes = pagina.path.split('/').filter((parte) => parte !== '');
    const cidadeSlug = partes[1];
    if (cidadeSlug === undefined) {
      continue;
    }
    const uf = (cidadeSlug.split('-').at(-1) ?? '').toUpperCase();
    const grupo: Grupo = porUf.get(uf) ?? { uf, cidades: new Map<string, CidadeDoMapa>() };
    const cidade: CidadeDoMapa = grupo.cidades.get(cidadeSlug) ?? {
      path: `/alugar/${cidadeSlug}`,
      count: 0,
      bairros: [],
    };
    if (partes.length === 2) {
      cidade.count = Math.max(cidade.count, pagina.count);
      cidade.path = pagina.path;
    } else if (partes.length === 3) {
      const bairro = partes[2];
      if (bairro !== undefined) {
        cidade.bairros.push({ path: pagina.path, nome: lugarLegivel(bairro) });
      }
    }
    grupo.cidades.set(cidadeSlug, cidade);
    porUf.set(uf, grupo);
  }

  const ufs = [...porUf.values()].sort((a, b) => a.uf.localeCompare(b.uf));

  return (
    <>
      <SiteHeader />
      <main className="pagina">
        <h1 className="pagina__titulo">Mapa do site</h1>

        {ufs.length === 0 ? (
          <EstadoVazio titulo="Ainda não há busca com imóvel suficiente">
            Assim que as imobiliárias publicarem, as buscas por cidade e bairro aparecem aqui.
          </EstadoVazio>
        ) : (
          ufs.map((grupo) => (
            <section className="mapa-uf" key={grupo.uf} aria-label={`Imóveis em ${grupo.uf}`}>
              <h2 className="secao__titulo">{grupo.uf}</h2>
              {[...grupo.cidades.entries()].map(([slug, cidade]) => (
                <div className="mapa-cidade" key={slug}>
                  <h3>
                    <a href={cidade.path}>{cidadeLegivel(slug)}</a>
                  </h3>
                  {cidade.bairros.length > 0 ? (
                    <ul className="mapa-bairros">
                      {cidade.bairros.map((bairro) => (
                        <li key={bairro.path}>
                          <a href={bairro.path}>{bairro.nome}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </section>
          ))
        )}
      </main>
      <SiteFooter />
    </>
  );
}
