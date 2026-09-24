import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ImovelCard } from '@/components/ImovelCard';
import { imovelDaApi } from '@/lib/adaptar';
import { Breadcrumb } from '@/components/Breadcrumb';
import { EstadoVazio } from '@/components/EstadoVazio';
import { AlertaImovel } from '@/components/AlertaImovel';
import {
  BairrosProximos,
  ChipsFiltro,
  FaixaTipo,
  FaqCalculado,
  LinksModificadores,
  Paginacao,
  ResumoPreco,
} from '@/components/busca';
import { buscarImoveis } from '@/lib/api';
import {
  PURPOSE_DE,
  TIPO_NO_DOMINIO,
  caminhoDoRecorte,
  cidadeLegivel,
  lerRecorte,
  lugarLegivel,
  temModificador,
} from '@/lib/rotas';
import type { Finalidade, RecorteDeBusca } from '@/lib/rotas';
import { TIPO_IMOVEL } from '@/lib/tipos';
import { formatarValor } from '@/lib/formato';
import {
  descricaoDoRecorte,
  jsonLdLista,
  jsonLdTrilha,
  metadataDaPagina,
  tituloComContagem,
  tituloDoRecorte,
} from '@/lib/seo';

/**
 * Página de busca (`/alugar/...` e `/comprar/...`). O que ela pode ou não fazer
 * com o buscador vem do servidor: `robots` e `indexable` são calculados pela
 * contagem real do recorte (ADR-099), nunca decididos aqui.
 */

interface Entrada {
  finalidade: Finalidade;
  segmentos: string[];
  pagina: number;
}

function lerEntrada(
  finalidade: Finalidade,
  segmentos: string[] | undefined,
  pagina: string | undefined,
): Entrada {
  const numero = Number(pagina ?? '1');
  return {
    finalidade,
    segmentos: segmentos ?? [],
    pagina: Number.isInteger(numero) && numero >= 1 && numero <= 200 ? numero : 1,
  };
}

async function carregar(entrada: Entrada) {
  const recorte = lerRecorte(entrada.finalidade, entrada.segmentos);
  if (recorte === null) {
    notFound();
  }
  const resposta = await buscarImoveis({
    purpose: PURPOSE_DE[recorte.finalidade],
    city: recorte.cidade,
    neighborhood: recorte.bairro ?? undefined,
    propertyType: recorte.tipo === null ? undefined : TIPO_NO_DOMINIO[recorte.tipo],
    bedrooms: recorte.quartos ?? undefined,
    page: entrada.pagina,
  });
  return { recorte, resposta };
}

export async function metadataDaBusca(
  finalidade: Finalidade,
  segmentos: string[] | undefined,
  pagina: string | undefined,
): Promise<Metadata> {
  const entrada = lerEntrada(finalidade, segmentos, pagina);
  const { recorte, resposta } = await carregar(entrada);
  const caminho = caminhoDoRecorte(recorte);
  const base = metadataDaPagina({
    titulo: tituloDoRecorte(recorte),
    descricao: descricaoDoRecorte(recorte, resposta.stats),
    caminho,
    robots: resposta.robots,
  });
  // Página 2 em diante: canônica para si mesma e fora do índice (ADR-099).
  return entrada.pagina > 1 ? { ...base, robots: { index: false, follow: true } } : base;
}

function perguntasDo(
  recorte: RecorteDeBusca,
  resposta: Awaited<ReturnType<typeof carregar>>['resposta'],
) {
  const perguntas: { pergunta: string; resposta: string }[] = [];
  const onde =
    recorte.bairro === null
      ? cidadeLegivel(recorte.cidade)
      : `${lugarLegivel(recorte.bairro)}, ${cidadeLegivel(recorte.cidade)}`;
  const oQue =
    recorte.tipo === null ? 'um imóvel' : `um ${TIPO_IMOVEL[recorte.tipo].nome.toLowerCase()}`;

  if (resposta.stats !== null && resposta.stats.medianCents !== null) {
    perguntas.push({
      pergunta:
        recorte.finalidade === 'alugar'
          ? `Quanto custa alugar ${oQue} em ${onde}?`
          : `Quanto custa comprar ${oQue} em ${onde}?`,
      resposta:
        recorte.finalidade === 'alugar'
          ? `A mediana do valor total do mês é ${formatarValor(resposta.stats.medianCents)}, numa faixa de ${formatarValor(resposta.stats.minCents)} a ${formatarValor(resposta.stats.maxCents)}. O total já inclui aluguel, condomínio e IPTU quando o anúncio informa.`
          : `A mediana do preço é ${formatarValor(resposta.stats.medianCents)}, numa faixa de ${formatarValor(resposta.stats.minCents)} a ${formatarValor(resposta.stats.maxCents)}.`,
    });
  }
  perguntas.push({
    pergunta: 'O endereço do imóvel aparece no anúncio?',
    resposta:
      'Não. O portal mostra bairro e cidade; o endereço exato você recebe no contato com a imobiliária responsável.',
  });
  if (resposta.total > 0) {
    perguntas.push({
      pergunta: 'Quem anuncia estes imóveis?',
      resposta:
        'Imobiliárias com CRECI, que aparecem no anúncio e na vitrine. O contato vai direto para a responsável pelo imóvel.',
    });
  }
  return perguntas;
}

export async function PaginaDeBusca({
  finalidade,
  segmentos,
  pagina,
}: {
  finalidade: Finalidade;
  segmentos: string[] | undefined;
  pagina: string | undefined;
}) {
  const entrada = lerEntrada(finalidade, segmentos, pagina);
  const { recorte, resposta } = await carregar(entrada);
  const caminho = caminhoDoRecorte(recorte);

  const trilhos = [
    { rotulo: 'Início', href: '/' },
    {
      rotulo: recorte.finalidade === 'alugar' ? 'Alugar' : 'Comprar',
      href: `/${recorte.finalidade}`,
    },
    {
      rotulo: cidadeLegivel(recorte.cidade),
      href: caminhoDoRecorte({ ...recorte, bairro: null, tipo: null, quartos: null }),
    },
  ];
  if (recorte.bairro !== null) {
    trilhos.push({
      rotulo: lugarLegivel(recorte.bairro),
      href: caminhoDoRecorte({ ...recorte, tipo: null, quartos: null }),
    });
  }
  if (recorte.tipo !== null) {
    trilhos.push({
      rotulo: TIPO_IMOVEL[recorte.tipo].nome,
      href: caminhoDoRecorte({ ...recorte, quartos: null }),
    });
  }

  const resumoDoAlerta = `${tituloDoRecorte(recorte)}${temModificador(recorte) ? '' : ''}`;

  return (
    <>
      <SiteHeader cor={recorte.tipo ?? 'acento'} />
      <script
        type="application/ld+json"
        // Dados estruturados: o conteúdo é montado no servidor a partir da resposta da API.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdTrilha(trilhos.map((t) => ({ nome: t.rotulo, caminho: t.href }))),
          ),
        }}
      />
      {resposta.items.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdLista(resposta.items)) }}
        />
      ) : null}

      <FaixaTipo tipo={recorte.tipo} titulo={tituloComContagem(recorte, resposta.total)} />

      <main className="pagina">
        <Breadcrumb
          trilhos={[
            ...trilhos.slice(0, -1).map((t) => ({ rotulo: t.rotulo, href: t.href })),
            { rotulo: trilhos.at(-1)?.rotulo ?? '' },
          ]}
        />
        <ChipsFiltro recorte={recorte} />

        {resposta.total === 0 ? (
          <EstadoVazio titulo="Nenhum imóvel com esses filtros">
            Tente tirar um filtro ou procurar num bairro vizinho. Criando um alerta, você recebe
            assim que aparecer algo aqui.
          </EstadoVazio>
        ) : (
          <div className="grade-cards">
            {resposta.items.map((imovel) => (
              <ImovelCard key={imovel.slug} imovel={imovelDaApi(imovel)} />
            ))}
          </div>
        )}

        <Paginacao
          pagina={resposta.page}
          totalPaginas={resposta.totalPages}
          caminhoBase={caminho}
        />

        <ResumoPreco stats={resposta.stats} finalidade={recorte.finalidade} />
        <BairrosProximos neighbors={resposta.neighbors} recorte={recorte} />
        <LinksModificadores recorte={recorte} stats={resposta.stats} />
        <FaqCalculado perguntas={perguntasDo(recorte, resposta)} />

        <AlertaImovel
          purpose={PURPOSE_DE[recorte.finalidade]}
          city={recorte.cidade}
          neighborhood={recorte.bairro ?? undefined}
          propertyType={recorte.tipo === null ? undefined : TIPO_NO_DOMINIO[recorte.tipo]}
          bedrooms={recorte.quartos ?? undefined}
          resumo={resumoDoAlerta}
        />
      </main>
      <SiteFooter />
    </>
  );
}
