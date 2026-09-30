import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { EstadoVazio } from '@/components/EstadoVazio';
import { BotaoLink } from '@/components/Botao';
import { buscarSitemap } from '@/lib/api';
import { cidadeLegivel } from '@/lib/rotas';
import type { Finalidade } from '@/lib/rotas';
import { metadataDaPagina } from '@/lib/seo';

/**
 * `/alugar` e `/comprar` sem cidade. A busca começa pela cidade (o portal é nacional e a API
 * exige `city`), então sem ela a página pede a cidade em vez de responder 404 — que era o destino
 * de "Alugar" e "Comprar" no cabeçalho (Onda 0 da rodada de fidelidade, defeito 6).
 *
 * As cidades vêm do sitemap da API: só as que têm recorte indexável naquela finalidade (ADR-099).
 * A página é de navegação e fica fora do índice.
 */

interface CidadeComImovel {
  path: string;
  nome: string;
  count: number;
}

const ACAO: Record<Finalidade, string> = { alugar: 'para alugar', comprar: 'à venda' };

async function cidadesDa(finalidade: Finalidade): Promise<CidadeComImovel[]> {
  const dados = await buscarSitemap().catch(() => ({ pages: [], listings: [], agencies: [] }));
  return dados.pages
    .map((pagina) => ({ pagina, partes: pagina.path.split('/').filter((parte) => parte !== '') }))
    .filter(({ partes }) => partes.length === 2 && partes[0] === finalidade)
    .map(({ pagina, partes }) => ({
      path: pagina.path,
      nome: cidadeLegivel(partes[1] ?? ''),
      count: pagina.count,
    }))
    .sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome));
}

export function metadataDaEscolha(finalidade: Finalidade): Metadata {
  return metadataDaPagina({
    titulo: `Imóveis ${ACAO[finalidade]}: escolha a cidade`,
    descricao: `Escolha a cidade para ver os imóveis ${ACAO[finalidade]} no AchouImóvel.`,
    caminho: `/${finalidade}`,
    robots: 'noindex, follow',
  });
}

export async function EscolhaDeCidade({ finalidade }: { finalidade: Finalidade }) {
  const cidades = await cidadesDa(finalidade);

  return (
    <>
      <SiteHeader />
      <main className="pagina">
        <h1 className="pagina__titulo">Imóveis {ACAO[finalidade]}: escolha a cidade</h1>

        {cidades.length === 0 ? (
          <EstadoVazio
            titulo={`Ainda não há cidade com imóveis ${ACAO[finalidade]}`}
            acao={<BotaoLink href="/">Voltar para o início</BotaoLink>}
          >
            Quando aparecer anúncio, a cidade entra nesta lista.
          </EstadoVazio>
        ) : (
          <ul className="mapa-bairros">
            {cidades.map((cidade) => (
              <li key={cidade.path}>
                <a href={cidade.path}>{cidade.nome}</a> · {cidade.count}{' '}
                {cidade.count === 1 ? 'imóvel' : 'imóveis'}
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
