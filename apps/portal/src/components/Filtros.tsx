import type { CSSProperties, ReactNode } from 'react';
import { TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';
import { formatarValor } from '@/lib/formato';

/*
 * Filtros da busca (telas/portal/02-busca: coluna de 280px no desktop, gaveta no celular).
 *
 * A busca é por URL: finalidade, tipo e quartos são segmentos do caminho, e valor e características
 * vão na query string (ADR-099). Por isso as opções são links — o filtro escolhido é a página
 * atual — e só a régua e as características usam formulário GET.
 *
 * `tamanho` segue os dois desenhos: `desktop` (controles de 40px, texto 14px) e `celular`
 * (44px e 15px, os alvos de toque da gaveta).
 */

export type TamanhoDoFiltro = 'desktop' | 'celular';

export interface FiltrosLateraisProps {
  children: ReactNode;
}

/** Coluna de filtros do desktop, com filete preto em cima e os grupos separados por 1px. */
export function FiltrosLaterais({ children }: FiltrosLateraisProps) {
  return (
    <aside className="filtros" aria-label="Filtros">
      {children}
    </aside>
  );
}

export interface GrupoFiltroProps {
  rotulo: string;
  tamanho?: TamanhoDoFiltro;
  /** Lista de opções marcáveis (tipo, características): espaço menor entre as linhas. */
  lista?: boolean;
  children: ReactNode;
}

/** Id estável sem hook: estes componentes também rodam no servidor. */
function idDe(...partes: string[]): string {
  return partes
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

export function GrupoFiltro({
  rotulo,
  tamanho = 'desktop',
  lista = false,
  children,
}: GrupoFiltroProps) {
  const id = idDe('filtro', rotulo, tamanho);
  const classes = [
    'filtros__grupo',
    `filtros__grupo--${tamanho}`,
    lista ? 'filtros__grupo--lista' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} role="group" aria-labelledby={id}>
      <span className="filtros__rotulo" id={id}>
        {rotulo}
      </span>
      {children}
    </div>
  );
}

export interface OpcaoMarcavelProps {
  rotulo: string;
  marcado: boolean;
  /** Quantos anúncios a opção traz; ausente, a contagem some. */
  contagem?: number;
  /** Quadrado da cor do tipo antes do nome. */
  tipo?: TipoImovel;
  /** Opção que é página (tipo): vira link para o recorte. */
  href?: string;
  /** Opção de formulário (características): vira caixa de marcar com este nome e valor. */
  nome?: string;
  valor?: string;
  tamanho?: TamanhoDoFiltro;
}

/** Linha de filtro com a caixa de marcar desenhada, o quadrado do tipo e a contagem. */
export function OpcaoMarcavel({
  rotulo,
  marcado,
  contagem,
  tipo,
  href,
  nome,
  valor,
  tamanho = 'desktop',
}: OpcaoMarcavelProps) {
  const classes = [
    'opcao-marcavel',
    `opcao-marcavel--${tamanho}`,
    tipo ? 'opcao-marcavel--tipo' : null,
    marcado ? 'opcao-marcavel--marcada' : null,
  ]
    .filter(Boolean)
    .join(' ');
  const conteudo = (
    <>
      <span className="opcao-marcavel__caixa" aria-hidden="true">
        {marcado ? '✓' : ''}
      </span>
      {tipo ? (
        <span
          className="opcao-marcavel__quadrado"
          aria-hidden="true"
          style={{ '--tipo-cor': TIPO_IMOVEL[tipo].cor } as CSSProperties}
        />
      ) : null}
      <span className="opcao-marcavel__rotulo">{rotulo}</span>
      {contagem === undefined ? null : (
        <span className="opcao-marcavel__contagem">{String(contagem)}</span>
      )}
    </>
  );

  if (href !== undefined) {
    return (
      <a className={classes} href={href} aria-current={marcado ? 'page' : undefined}>
        {conteudo}
      </a>
    );
  }
  return (
    <label className={classes}>
      <input
        type="checkbox"
        className="visualmente-oculto"
        name={nome}
        value={valor}
        defaultChecked={marcado}
      />
      {conteudo}
    </label>
  );
}

export interface OpcaoDeQuartos {
  rotulo: string;
  href: string;
  marcado: boolean;
}

/** Quartos em quatro botões (1, 2, 3, 4+); o escolhido fica preto. */
export function BotoesQuartos({
  opcoes,
  tamanho = 'desktop',
}: {
  opcoes: readonly OpcaoDeQuartos[];
  tamanho?: TamanhoDoFiltro;
}) {
  return (
    <div className={`quartos quartos--${tamanho}`}>
      {opcoes.map((opcao) => (
        <a
          key={opcao.rotulo}
          href={opcao.href}
          className={opcao.marcado ? 'quartos__opcao quartos__opcao--marcada' : 'quartos__opcao'}
          aria-current={opcao.marcado ? 'page' : undefined}
          aria-label={`${opcao.rotulo} ${opcao.rotulo === '1' ? 'quarto' : 'quartos'}`}
        >
          {opcao.rotulo}
        </a>
      ))}
    </div>
  );
}

export interface ReguaValorProps {
  /** Nome do campo na query string. */
  nome: string;
  /** Teto escolhido, em centavos; nulo é "sem limite". */
  valorCents: number | null;
  minimoCents: number;
  maximoCents: number;
  passoCents: number;
  rotulo?: string;
  nota?: string;
}

/**
 * "Valor total até": régua com o trecho escolhido em preto e o valor em verde. É um
 * `<input type="range">` de verdade, para teclado e leitor de tela.
 */
export function ReguaValor({
  nome,
  valorCents,
  minimoCents,
  maximoCents,
  passoCents,
  rotulo = 'Valor total até',
  nota = 'Aluguel + condomínio + IPTU',
}: ReguaValorProps) {
  const id = idDe('regua', nome);
  const atual = valorCents ?? maximoCents;
  const fracao =
    maximoCents === minimoCents ? 1 : (atual - minimoCents) / (maximoCents - minimoCents);
  const estilo = { '--preenchido': `${String(Math.round(fracao * 100))}%` } as CSSProperties;
  return (
    <div className="regua">
      <div className="regua__cabecalho">
        <label htmlFor={id}>{rotulo}</label>
        <span className="regua__valor">
          {valorCents === null ? 'Sem limite' : formatarValor(valorCents)}
        </span>
      </div>
      <input
        id={id}
        className="regua__controle"
        type="range"
        name={nome}
        min={minimoCents}
        max={maximoCents}
        step={passoCents}
        defaultValue={atual}
        style={estilo}
      />
      <span className="regua__nota">{nota}</span>
    </div>
  );
}

export interface OpcaoDeOrdem {
  valor: string;
  /** Em minúsculas, como no desktop ("Ordenar: mais recentes"); o celular põe a inicial maiúscula. */
  rotulo: string;
}

export const ORDENS: readonly OpcaoDeOrdem[] = [
  { valor: 'RECENT', rotulo: 'mais recentes' },
  { valor: 'PRICE_ASC', rotulo: 'menor valor' },
  { valor: 'PRICE_DESC', rotulo: 'maior valor' },
];

function comInicialMaiuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}

export interface OrdenacaoProps {
  nome?: string;
  valor: string;
  opcoes?: readonly OpcaoDeOrdem[];
  tamanho?: TamanhoDoFiltro;
}

/**
 * Ordenação: um `<select>` nativo com a cara do botão das telas — "Ordenar: mais recentes ▾"
 * no desktop, "Mais recentes ▾" no celular.
 */
export function Ordenacao({
  nome = 'ordem',
  valor,
  opcoes = ORDENS,
  tamanho = 'desktop',
}: OrdenacaoProps) {
  const id = idDe('ordenacao', tamanho);
  return (
    <div className={`ordenacao ordenacao--${tamanho}`}>
      <label
        htmlFor={id}
        className={tamanho === 'desktop' ? 'ordenacao__rotulo' : 'visualmente-oculto'}
      >
        Ordenar:
      </label>
      <select id={id} name={nome} defaultValue={valor} className="ordenacao__controle">
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {tamanho === 'desktop' ? opcao.rotulo : comInicialMaiuscula(opcao.rotulo)}
          </option>
        ))}
      </select>
      <span className="ordenacao__seta" aria-hidden="true">
        ▾
      </span>
    </div>
  );
}

export interface ChipDeFiltro {
  rotulo: string;
  /** Endereço da busca sem este filtro. */
  hrefRemover: string;
}

/** Filtros aplicados acima dos resultados, cada um com o caminho que o tira, e "Limpar tudo". */
export function ChipsDeFiltro({
  chips,
  hrefLimpar,
}: {
  chips: readonly ChipDeFiltro[];
  hrefLimpar?: string;
}) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="chips-filtro" aria-label="Filtros aplicados">
      {chips.map((chip) => (
        <a key={chip.rotulo} className="chip chip--removivel" href={chip.hrefRemover}>
          {chip.rotulo}
          <span className="chip__x" aria-hidden="true">
            ×
          </span>
          <span className="visualmente-oculto">tirar filtro</span>
        </a>
      ))}
      {hrefLimpar === undefined ? null : (
        <a className="chips-filtro__limpar" href={hrefLimpar}>
          Limpar tudo
        </a>
      )}
    </div>
  );
}

export interface BarraFiltrosCelularProps {
  /** Quantos filtros estão aplicados (o número no botão). */
  aplicados: number;
  aoAbrirFiltros?: () => void;
  ordenacao: ReactNode;
}

/** Barra presa ao topo no celular: "Filtros" com a contagem e a ordenação lado a lado. */
export function BarraFiltrosCelular({
  aplicados,
  aoAbrirFiltros,
  ordenacao,
}: BarraFiltrosCelularProps) {
  return (
    <div className="barra-filtros">
      <button type="button" className="barra-filtros__botao" onClick={aoAbrirFiltros}>
        Filtros
        {aplicados > 0 ? (
          <span className="barra-filtros__contagem" aria-label={`${String(aplicados)} aplicados`}>
            {String(aplicados)}
          </span>
        ) : null}
      </button>
      {ordenacao}
    </div>
  );
}
