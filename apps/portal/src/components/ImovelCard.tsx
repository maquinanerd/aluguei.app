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
  banheiros?: number | null;
  vagas?: number | null;
  areaM2?: number | null;
  fotos: number;
  /** URL já pronta para o navegador; nunca `storage_key` (teste de privacidade). */
  fotoUrl?: string | null;
  fotoLegenda?: string | null;
  anunciante?: { nome: string; creci: string } | null;
}

export interface ImovelCardProps {
  imovel: ImovelResumo;
  variante?: 'listagem' | 'compacto' | 'parecido';
}

const SELO: Record<Finalidade, string> = {
  aluguel: 'Aluguel',
  venda: 'Venda',
  ambos: 'Aluguel ou venda',
};

function valorPrincipal(imovel: ImovelResumo): string {
  if (imovel.finalidade === 'venda') {
    return formatarValor(imovel.precoVendaCents);
  }
  const total = imovel.totalMensalCents ?? imovel.aluguelCents;
  return `${formatarValor(total)}/mês`;
}

function linhaDeApoio(imovel: ImovelResumo): string {
  if (imovel.finalidade === 'venda') {
    const partes: string[] = [];
    if (imovel.condominioCents != null) {
      partes.push(`Condomínio ${formatarValor(imovel.condominioCents)}`);
    }
    if (imovel.iptuCents != null) {
      partes.push(`IPTU ${formatarValor(imovel.iptuCents)}`);
    }
    return partes.join(' · ');
  }
  const partes: string[] = [];
  if (imovel.aluguelCents != null) {
    partes.push(`Aluguel ${formatarValor(imovel.aluguelCents)}`);
  }
  if (imovel.condominioCents != null) {
    partes.push(`condomínio ${formatarValor(imovel.condominioCents)}`);
  }
  if (imovel.iptuCents != null) {
    partes.push(`IPTU ${formatarValor(imovel.iptuCents)}`);
  }
  if (imovel.finalidade === 'ambos' && imovel.precoVendaCents != null) {
    partes.push(`ou ${formatarValor(imovel.precoVendaCents)} à venda`);
  }
  return partes.join(' · ');
}

function atributos(imovel: ImovelResumo): string[] {
  const lista: string[] = [];
  if (imovel.quartos != null) {
    lista.push(plural(imovel.quartos, 'quarto', 'quartos'));
  }
  if (imovel.banheiros != null) {
    lista.push(plural(imovel.banheiros, 'banheiro', 'banheiros'));
  }
  if (imovel.vagas != null) {
    lista.push(plural(imovel.vagas, 'vaga', 'vagas'));
  }
  if (imovel.areaM2 != null) {
    lista.push(`${String(imovel.areaM2)} m²`);
  }
  return lista;
}

/**
 * Card de imóvel do portal. O card inteiro é o link — sem botão "Contatar"
 * repetido. Nunca mostra rua, número, CEP nem coordenada: só bairro e cidade.
 */
export function ImovelCard({ imovel, variante = 'listagem' }: ImovelCardProps) {
  const tipo = TIPO_IMOVEL[imovel.tipo];
  const apoio = linhaDeApoio(imovel);
  const estilo = { '--tipo-cor': tipo.cor } as CSSProperties;

  return (
    <a
      className={variante === 'compacto' ? 'imovel-card imovel-card--compacto' : 'imovel-card'}
      href={`/imovel/${imovel.slug}`}
      style={estilo}
    >
      <span className="imovel-card__foto">
        {imovel.fotoUrl ? (
          // <img> cru e não next/image: a URL da foto vem do storage e a decisão
          // entre URL assinada e CDN é da Onda 2A (R3 do plano).
          <img
            src={imovel.fotoUrl}
            alt={imovel.fotoLegenda ?? `${tipo.nome} no ${imovel.bairro}`}
          />
        ) : (
          <span>Sem foto</span>
        )}
        <span className="imovel-card__selo">{SELO[imovel.finalidade]}</span>
        {imovel.fotos > 0 ? (
          <span className="imovel-card__contador">1/{String(imovel.fotos)}</span>
        ) : null}
      </span>

      <span className="imovel-card__tipo">
        <span className="imovel-card__quadrado" aria-hidden="true" />
        {tipo.nome} · {imovel.bairro}, {imovel.cidade} · {imovel.uf}
      </span>

      <span className="imovel-card__valores">
        <span className="imovel-card__valor">{valorPrincipal(imovel)}</span>
        {apoio ? <span className="imovel-card__detalhe">{apoio}</span> : null}
      </span>

      <span className="imovel-card__atributos">
        {atributos(imovel).map((atributo) => (
          <span key={atributo}>{atributo}</span>
        ))}
      </span>

      {imovel.anunciante ? (
        <span className="imovel-card__anunciante">
          {imovel.anunciante.nome} · CRECI {imovel.anunciante.creci}
        </span>
      ) : null}
    </a>
  );
}
