import type { CSSProperties } from 'react';
import { TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';
import { formatarValor, plural } from '@/lib/formato';

export type Finalidade = 'aluguel' | 'venda' | 'ambos';

export interface ImovelResumo {
  slug: string;
  tipo: TipoImovel;
  finalidade: Finalidade;
  bairro: string;
  cidade: string;
  uf: string;
  /** Aluguel e encargos, em centavos. O total do mês é o que aparece em destaque. */
  aluguelCents?: number | null;
  condominioCents?: number | null;
  iptuCents?: number | null;
  totalMensalCents?: number | null;
  /** Venda, em centavos. */
  precoVendaCents?: number | null;
  quartos?: number | null;
  /** O domínio ainda não guarda suítes (B1, Onda 2); sem o dado, o atributo some. */
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  areaM2?: number | null;
  /** Fora do contrato público até a Onda 2 (B1); sem o dado, o atributo some. */
  mobiliado?: boolean | null;
  aceitaPet?: boolean | null;
  fotos: number;
  /** URL já pronta para o navegador; nunca `storage_key` (teste de privacidade). */
  fotoUrl?: string | null;
  fotoLegenda?: string | null;
  anunciante?: { nome: string; creci: string } | null;
}

/**
 * Formas do card nas telas (`design-source/achouimovel/telas/portal`):
 * - `amostra` — a anatomia completa da identidade (00): selo da finalidade, contador, atributos
 *   em lista e a imobiliária com CRECI.
 * - `lista` — Home e busca (01, 02): contador, local com UF, linha de apoio e atributos numa
 *   linha com filete em cima; no celular o filete sai e o espaço cai para 10px.
 * - `poucos` — busca com poucos anúncios (02): sem contador e sem linha de apoio.
 * - `parecido` — "Outros imóveis" do anúncio, "Parecidos" do indisponível e a vitrine (03, 04):
 *   só o bairro, valor em 19px, sem contador e sem linha de apoio.
 */
export type FormaDoCard = 'amostra' | 'lista' | 'poucos' | 'parecido';

export interface ImovelCardProps {
  imovel: ImovelResumo;
  variante?: FormaDoCard;
}

const SELO: Record<Finalidade, string> = {
  aluguel: 'Alugar',
  venda: 'Comprar',
  ambos: 'Alugar ou comprar',
};

function valorPrincipal(imovel: ImovelResumo): string {
  if (imovel.finalidade === 'venda') {
    return formatarValor(imovel.precoVendaCents);
  }
  if (imovel.totalMensalCents != null) {
    return `${formatarValor(imovel.totalMensalCents)} total/mês`;
  }
  return `${formatarValor(imovel.aluguelCents)}/mês`;
}

function linhaDeApoio(imovel: ImovelResumo): string {
  const encargos = [
    imovel.condominioCents == null ? null : `Cond. ${formatarValor(imovel.condominioCents)}`,
    imovel.iptuCents == null ? null : `IPTU ${formatarValor(imovel.iptuCents)}`,
  ];
  if (imovel.finalidade === 'venda') {
    const porMetro =
      imovel.precoVendaCents != null && imovel.areaM2 != null && imovel.areaM2 > 0
        ? `${formatarValor(imovel.precoVendaCents / imovel.areaM2)}/m²`
        : null;
    return [porMetro, ...encargos].filter(Boolean).join(' · ');
  }
  if (imovel.finalidade === 'ambos') {
    return imovel.precoVendaCents == null
      ? ''
      : `ou ${formatarValor(imovel.precoVendaCents)} à venda`;
  }
  const aluguel =
    imovel.aluguelCents == null ? null : `Aluguel ${formatarValor(imovel.aluguelCents)}`;
  return [aluguel, ...encargos].filter(Boolean).join(' · ');
}

/** Área · quartos · suítes · vagas, e depois mobiliado e pet. Zero ou ausente some. */
function atributos(imovel: ImovelResumo): string[] {
  const lista: string[] = [];
  if (imovel.areaM2 != null && imovel.areaM2 > 0) {
    lista.push(`${String(imovel.areaM2)} m²`);
  }
  if (imovel.quartos) {
    lista.push(plural(imovel.quartos, 'quarto', 'quartos'));
  }
  if (imovel.suites) {
    lista.push(plural(imovel.suites, 'suíte', 'suítes'));
  }
  if (imovel.vagas) {
    lista.push(plural(imovel.vagas, 'vaga', 'vagas'));
  }
  if (imovel.mobiliado === true) {
    lista.push('mobiliado');
  }
  if (imovel.aceitaPet === true) {
    lista.push('aceita pet');
  }
  return lista;
}

function local(imovel: ImovelResumo, variante: FormaDoCard): string {
  if (variante === 'parecido') {
    return imovel.bairro || imovel.cidade;
  }
  const lugar = [imovel.bairro, imovel.cidade].filter(Boolean).join(', ');
  return variante === 'amostra' || !imovel.uf ? lugar : `${lugar} · ${imovel.uf}`;
}

/**
 * Card de imóvel do portal. O card inteiro é o link — sem botão "Contatar"
 * repetido. Nunca mostra rua, número, CEP nem coordenada: só bairro e cidade.
 */
export function ImovelCard({ imovel, variante = 'lista' }: ImovelCardProps) {
  const tipo = TIPO_IMOVEL[imovel.tipo];
  const comApoio = variante === 'amostra' || variante === 'lista';
  const comContador = comApoio && imovel.fotos > 0;
  const apoio = comApoio ? linhaDeApoio(imovel) : '';
  const lista = atributos(imovel);
  const estilo = { '--tipo-cor': tipo.cor } as CSSProperties;

  return (
    <a
      className={`imovel-card imovel-card--${variante}`}
      href={`/imovel/${imovel.slug}`}
      style={estilo}
    >
      <span className="imovel-card__foto">
        {imovel.fotoUrl ? (
          // <img> cru e não next/image: a URL da foto vem do storage e a decisão
          // entre URL assinada e CDN é da Onda 2A (R3 do plano).
          <img
            src={imovel.fotoUrl}
            alt={imovel.fotoLegenda ?? `${tipo.nome} no ${imovel.bairro || imovel.cidade}`}
          />
        ) : (
          <span className="imovel-card__marcador">Foto do imóvel</span>
        )}
        {variante === 'amostra' ? (
          <span className="imovel-card__selo">{SELO[imovel.finalidade]}</span>
        ) : null}
        {comContador ? (
          <span className="imovel-card__contador">1/{String(imovel.fotos)}</span>
        ) : null}
      </span>

      <span className="imovel-card__tipo">
        <span className="imovel-card__quadrado" aria-hidden="true" />
        {tipo.nome} · {local(imovel, variante)}
      </span>

      {comApoio ? (
        <span className="imovel-card__valores">
          <span className="imovel-card__valor">{valorPrincipal(imovel)}</span>
          {apoio ? <span className="imovel-card__detalhe">{apoio}</span> : null}
        </span>
      ) : (
        <span className="imovel-card__valor">{valorPrincipal(imovel)}</span>
      )}

      {lista.length === 0 ? null : variante === 'amostra' ? (
        <span className="imovel-card__atributos">
          {lista.map((atributo) => (
            <span key={atributo}>{atributo}</span>
          ))}
        </span>
      ) : (
        <span className="imovel-card__atributos">{lista.join(' · ')}</span>
      )}

      {variante === 'amostra' && imovel.anunciante ? (
        <span className="imovel-card__anunciante">
          {imovel.anunciante.nome} · CRECI {imovel.anunciante.creci}
        </span>
      ) : null}
    </a>
  );
}
