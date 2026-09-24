import type { CSSProperties } from 'react';
import type { PublicSearchResponse } from '@aluguei/contracts';
import { TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';
import { formatarValor } from '@/lib/formato';
import { caminhoDoRecorte, lugarLegivel } from '@/lib/rotas';
import type { RecorteDeBusca } from '@/lib/rotas';
import { Chip } from './Chip';
import { BlocoGrade } from './BlocoGrade';

/** Faixa cheia na cor do tipo, com o H1 e a contagem (telas · busca-desktop). */
export function FaixaTipo({ tipo, titulo }: { tipo: TipoImovel | null; titulo: string }) {
  if (tipo === null) {
    return (
      <div className="faixa-tipo faixa-tipo--neutra">
        <h1 className="faixa-tipo__titulo">{titulo}</h1>
      </div>
    );
  }
  return (
    <BlocoGrade cor={tipo} grade="band" className="faixa-tipo">
      <h1 className="faixa-tipo__titulo">{titulo}</h1>
    </BlocoGrade>
  );
}

export interface ResumoPrecoProps {
  stats: PublicSearchResponse['stats'];
  finalidade: 'alugar' | 'comprar';
}

/**
 * Mediana e faixa do recorte. Some inteiro com amostra pequena — quem decide é
 * o servidor (`stats` nulo), não esta tela.
 */
export function ResumoPreco({ stats, finalidade }: ResumoPrecoProps) {
  if (stats === null) {
    return null;
  }
  const oQue = finalidade === 'alugar' ? 'valor total do mês' : 'preço';
  return (
    <section className="resumo-preco" aria-label={`Estatística de ${oQue}`}>
      <div className="resumo-preco__linha">
        <span className="resumo-preco__rotulo">Mediana do {oQue}</span>
        <span className="resumo-preco__valor">{formatarValor(stats.medianCents)}</span>
      </div>
      <div className="resumo-preco__linha">
        <span className="resumo-preco__rotulo">Faixa</span>
        <span>
          {formatarValor(stats.minCents)} a {formatarValor(stats.maxCents)}
        </span>
      </div>
      {stats.byBedrooms.length > 0 ? (
        <table className="resumo-preco__tabela">
          <caption>Mediana por número de quartos</caption>
          <thead>
            <tr>
              <th scope="col">Quartos</th>
              <th scope="col">Anúncios</th>
              <th scope="col">Mediana</th>
            </tr>
          </thead>
          <tbody>
            {stats.byBedrooms.map((linha) => (
              <tr key={linha.bedrooms}>
                <th scope="row">{linha.bedrooms === 4 ? '4 ou mais' : linha.bedrooms}</th>
                <td>{linha.count}</td>
                <td>{formatarValor(linha.medianCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="resumo-preco__nota">
        Calculado sobre os {String(stats.sampleSize)} anúncios desta busca, agora.
      </p>
    </section>
  );
}

export interface BairrosProximosProps {
  neighbors: PublicSearchResponse['neighbors'];
  recorte: RecorteDeBusca;
}

/** Bairros vizinhos com contagem e mediana — o link interno que sustenta a cauda longa. */
export function BairrosProximos({ neighbors, recorte }: BairrosProximosProps) {
  if (neighbors.length === 0) {
    return null;
  }
  return (
    <section className="lista-filete" aria-label="Bairros vizinhos">
      <h2 className="secao__titulo">Bairros vizinhos</h2>
      <ul>
        {neighbors.map((vizinho) => (
          <li key={vizinho.slug}>
            <a href={caminhoDoRecorte({ ...recorte, bairro: vizinho.slug, quartos: null })}>
              {vizinho.name}
            </a>
            <span className="lista-filete__apoio">
              {String(vizinho.count)} {vizinho.count === 1 ? 'imóvel' : 'imóveis'}
              {vizinho.medianCents === null
                ? ''
                : ` · mediana ${formatarValor(vizinho.medianCents)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface LinksModificadoresProps {
  recorte: RecorteDeBusca;
  /** Contagem por quartos, vinda da estatística; sem ela, não há link. */
  stats: PublicSearchResponse['stats'];
}

/**
 * Links para recortes vizinhos (2 quartos, 3 quartos...). Só entram os que têm
 * anúncio suficiente para indexar: link para página `noindex` é desperdício.
 */
export function LinksModificadores({ recorte, stats }: LinksModificadoresProps) {
  if (stats === null || recorte.tipo === null) {
    return null;
  }
  const comEstoque = stats.byBedrooms.filter((linha) => linha.count >= 5);
  if (comEstoque.length === 0) {
    return null;
  }
  const tipo = recorte.tipo;
  return (
    <section className="lista-filete" aria-label="Buscas parecidas">
      <h2 className="secao__titulo">Buscas parecidas</h2>
      <ul>
        {comEstoque.map((linha) => (
          <li key={linha.bedrooms}>
            <a href={caminhoDoRecorte({ ...recorte, quartos: linha.bedrooms })}>
              {TIPO_IMOVEL[tipo].plural} de {String(linha.bedrooms)}
              {linha.bedrooms === 4 ? ' ou mais quartos' : ' quartos'}
              {recorte.bairro === null ? '' : ` no ${lugarLegivel(recorte.bairro)}`}
            </a>
            <span className="lista-filete__apoio">{String(linha.count)} anúncios</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ChipsFiltroProps {
  recorte: RecorteDeBusca;
}

/** Filtros aplicados, cada um com o caminho que o remove. */
export function ChipsFiltro({ recorte }: ChipsFiltroProps) {
  const chips: { rotulo: string; href: string }[] = [];
  if (recorte.bairro !== null) {
    chips.push({
      rotulo: lugarLegivel(recorte.bairro),
      href: caminhoDoRecorte({ ...recorte, bairro: null }),
    });
  }
  if (recorte.tipo !== null) {
    chips.push({
      rotulo: TIPO_IMOVEL[recorte.tipo].nome,
      href: caminhoDoRecorte({ ...recorte, tipo: null, quartos: null }),
    });
  }
  if (recorte.quartos !== null) {
    chips.push({
      rotulo: `${String(recorte.quartos)} quartos`,
      href: caminhoDoRecorte({ ...recorte, quartos: null }),
    });
  }
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="chips" aria-label="Filtros aplicados">
      {chips.map((chip) => (
        <a key={chip.rotulo} className="chips__item" href={chip.href}>
          <Chip>
            {chip.rotulo} <span aria-hidden="true">×</span>
            <span className="visualmente-oculto">tirar filtro</span>
          </Chip>
        </a>
      ))}
    </div>
  );
}

export interface PaginacaoProps {
  pagina: number;
  totalPaginas: number;
  caminhoBase: string;
}

/** Paginação por query string: a página 2 em diante nunca indexa (ADR-099). */
export function Paginacao({ pagina, totalPaginas, caminhoBase }: PaginacaoProps) {
  if (totalPaginas <= 1) {
    return null;
  }
  const link = (destino: number): string =>
    destino === 1 ? caminhoBase : `${caminhoBase}?pagina=${String(destino)}`;
  return (
    <nav className="paginacao" aria-label="Paginação">
      {pagina > 1 ? <a href={link(pagina - 1)}>← Anterior</a> : <span aria-hidden="true" />}
      <span>
        Página {String(pagina)} de {String(totalPaginas)}
      </span>
      {pagina < totalPaginas ? (
        <a href={link(pagina + 1)}>Próxima →</a>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}

export interface MosaicoTiposProps {
  /** Contagem por tipo; tipo sem anúncio não vira bloco. */
  contagens: { tipo: TipoImovel; total: number; href: string }[];
}

/** Mosaico de tipos da Home: bloco cheio na cor do tipo, com grade. */
export function MosaicoTipos({ contagens }: MosaicoTiposProps) {
  if (contagens.length === 0) {
    return null;
  }
  return (
    <section className="mosaico" aria-label="Procure pelo tipo">
      <h2 className="secao__titulo">Procure pelo tipo</h2>
      <div className="mosaico__grade">
        {contagens.map((item) => (
          <a key={item.tipo} className="mosaico__item" href={item.href}>
            <BlocoGrade cor={item.tipo} grade="tile">
              <span className="mosaico__contagem">
                {String(item.total)} {item.total === 1 ? 'imóvel' : 'imóveis'}
              </span>
              <span className="mosaico__nome">{TIPO_IMOVEL[item.tipo].nome}</span>
            </BlocoGrade>
          </a>
        ))}
      </div>
    </section>
  );
}

export interface FaqCalculadoProps {
  perguntas: { pergunta: string; resposta: string }[];
}

/**
 * FAQ com os números do recorte. Vai como marcação semântica: desde 2023 o
 * Google restringiu o resultado rico de FAQ a governo e saúde, então aqui ela
 * serve para a pessoa e para entendimento de entidade, não para snippet.
 */
export function FaqCalculado({ perguntas }: FaqCalculadoProps) {
  if (perguntas.length === 0) {
    return null;
  }
  return (
    <section className="faq" aria-label="Perguntas frequentes">
      <h2 className="secao__titulo">Perguntas frequentes</h2>
      {perguntas.map((item) => (
        <details className="faq__item" key={item.pergunta}>
          <summary>{item.pergunta}</summary>
          <p>{item.resposta}</p>
        </details>
      ))}
    </section>
  );
}

export function estiloDoTipo(tipo: TipoImovel): CSSProperties {
  return { '--tipo-cor': TIPO_IMOVEL[tipo].cor } as CSSProperties;
}
