import type { PublicListingDetail } from '@aluguei/contracts';
import { TIPO_IMOVEL } from '@/lib/tipos';
import { formatarValor, plural } from '@/lib/formato';
import { caminhoDaVitrine, tipoDoDominio } from '@/lib/rotas';

/** Galeria do anúncio. A legenda é a que a imobiliária confirmou, nunca inventada. */
export function GaleriaImovel({ listing }: { listing: PublicListingDetail }) {
  if (listing.photos.length === 0) {
    return (
      <div className="galeria galeria--vazia">
        <span>Este anúncio ainda não tem foto.</span>
      </div>
    );
  }
  const [capa, ...demais] = listing.photos;
  return (
    <div className="galeria">
      {capa ? (
        <figure className="galeria__capa">
          {/* <img> cru: a foto vem do caminho estável do portal, que já redireciona
              para a URL assinada (ADR-099). next/image entraria com a variante WebP,
              pendência de performance registrada no plano. */}
          <img
            src={capa.path}
            alt={capa.caption ?? listing.title}
            width={1200}
            height={900}
            fetchPriority="high"
          />
          {capa.caption === null ? null : <figcaption>{capa.caption}</figcaption>}
        </figure>
      ) : null}
      {demais.length > 0 ? (
        <div className="galeria__miniaturas">
          {demais.map((foto) => (
            <figure key={foto.path}>
              <img
                src={foto.path}
                alt={foto.caption ?? listing.title}
                width={400}
                height={300}
                loading="lazy"
              />
              {foto.caption === null ? null : <figcaption>{foto.caption}</figcaption>}
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bloco de valor: aluguel mostra o total do mês em destaque com os valores
 * separados embaixo; venda mostra o preço e o preço por m²; nas duas
 * finalidades, as duas colunas.
 */
export function BlocoValor({ listing }: { listing: PublicListingDetail }) {
  const temAluguel = listing.purpose !== 'SALE' && listing.totalMonthlyCents !== null;
  const temVenda = listing.purpose !== 'RENT' && listing.salePriceCents !== null;

  return (
    <div className="bloco-valor">
      {temAluguel ? (
        <div className="bloco-valor__coluna">
          <span className="bloco-valor__rotulo">Aluguel</span>
          <span className="bloco-valor__destaque">
            {formatarValor(listing.totalMonthlyCents)}
            <span className="bloco-valor__unidade">/mês</span>
          </span>
          <dl className="bloco-valor__detalhe">
            <div>
              <dt>Aluguel</dt>
              <dd>{formatarValor(listing.monthlyRentCents)}</dd>
            </div>
            {listing.condoFeeCents === null ? null : (
              <div>
                <dt>Condomínio</dt>
                <dd>{formatarValor(listing.condoFeeCents)}</dd>
              </div>
            )}
            {listing.iptuCents === null ? null : (
              <div>
                <dt>IPTU</dt>
                <dd>{formatarValor(listing.iptuCents)}</dd>
              </div>
            )}
          </dl>
        </div>
      ) : null}

      {temVenda ? (
        <div className="bloco-valor__coluna">
          <span className="bloco-valor__rotulo">Venda</span>
          <span className="bloco-valor__destaque">{formatarValor(listing.salePriceCents)}</span>
          <dl className="bloco-valor__detalhe">
            {listing.pricePerSqmCents === null ? null : (
              <div>
                <dt>Preço por m²</dt>
                <dd>{formatarValor(listing.pricePerSqmCents)}</dd>
              </div>
            )}
            {listing.condoFeeCents === null ? null : (
              <div>
                <dt>Condomínio</dt>
                <dd>{formatarValor(listing.condoFeeCents)}</dd>
              </div>
            )}
            {listing.iptuCents === null ? null : (
              <div>
                <dt>IPTU</dt>
                <dd>{formatarValor(listing.iptuCents)}</dd>
              </div>
            )}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

export function AtributosImovel({ listing }: { listing: PublicListingDetail }) {
  const itens: { rotulo: string; valor: string }[] = [];
  if (listing.bedrooms !== null) {
    itens.push({ rotulo: 'Quartos', valor: plural(listing.bedrooms, 'quarto', 'quartos') });
  }
  if (listing.bathrooms !== null) {
    itens.push({ rotulo: 'Banheiros', valor: plural(listing.bathrooms, 'banheiro', 'banheiros') });
  }
  if (listing.parkingSpots !== null) {
    itens.push({ rotulo: 'Vagas', valor: plural(listing.parkingSpots, 'vaga', 'vagas') });
  }
  if (listing.areaSqm !== null) {
    itens.push({ rotulo: 'Área', valor: `${String(listing.areaSqm)} m²` });
  }
  if (itens.length === 0) {
    return null;
  }
  return (
    <dl className="atributos">
      {itens.map((item) => (
        <div key={item.rotulo}>
          <dt>{item.rotulo}</dt>
          <dd>{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Caracteristicas({ features }: { features: string[] }) {
  if (features.length === 0) {
    return null;
  }
  return (
    <section aria-label="Características">
      <h2 className="secao__titulo">Características</h2>
      <ul className="caracteristicas">
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </section>
  );
}

/** Bairro e cidade, sem endereço. É o que o portal pode mostrar. */
export function LocalBairro({ listing }: { listing: PublicListingDetail }) {
  const onde = [listing.neighborhood, listing.city, listing.state].filter(Boolean).join(', ');
  if (onde === '') {
    return null;
  }
  return (
    <section aria-label="Localização">
      <h2 className="secao__titulo">Onde fica</h2>
      <p className="local-bairro">{onde}</p>
      <p className="local-bairro__nota">
        O portal mostra bairro e cidade. O endereço exato você recebe no contato com a imobiliária.
      </p>
    </section>
  );
}

export interface ComparacaoMedianaProps {
  listing: PublicListingDetail;
}

/** Comparação com a mediana do bairro. Some sem amostra — o servidor devolve nulo. */
export function ComparacaoMediana({ listing }: ComparacaoMedianaProps) {
  const mediana = listing.neighborhoodMedianCents;
  const valor = listing.purpose === 'SALE' ? listing.salePriceCents : listing.totalMonthlyCents;
  if (mediana === null || valor === null) {
    return null;
  }
  const diferenca = Math.round(((valor - mediana) / mediana) * 100);
  const comparacao =
    diferenca === 0
      ? 'igual à mediana do bairro'
      : diferenca > 0
        ? `${String(diferenca)}% acima da mediana do bairro`
        : `${String(Math.abs(diferenca))}% abaixo da mediana do bairro`;
  return (
    <section className="comparacao" aria-label="Comparação com o bairro">
      <h2 className="secao__titulo">Comparado ao bairro</h2>
      <p>
        Este imóvel está <strong>{comparacao}</strong> ({formatarValor(mediana)}).
      </p>
    </section>
  );
}

/** Quem anuncia: nome e CRECI, com link para a vitrine. */
export function AnuncianteInfo({ listing }: { listing: PublicListingDetail }) {
  return (
    <section className="anunciante" aria-label="Quem anuncia">
      <h2 className="secao__titulo">Quem anuncia</h2>
      <p>
        <a href={caminhoDaVitrine(listing.org.slug)}>{listing.org.name}</a>
        {listing.org.creci === null ? null : <> · CRECI {listing.org.creci}</>}
      </p>
    </section>
  );
}

export function CabecalhoAnuncio({ listing }: { listing: PublicListingDetail }) {
  const tipo = tipoDoDominio(listing.propertyType);
  const onde = [listing.neighborhood, listing.city, listing.state].filter(Boolean).join(', ');
  return (
    <header className="anuncio__cabecalho">
      <span className="anuncio__tipo">
        {tipo === null ? 'Imóvel' : TIPO_IMOVEL[tipo].nome}
        {onde === '' ? '' : ` · ${onde}`}
      </span>
      <h1 className="anuncio__titulo">{listing.title}</h1>
    </header>
  );
}

export function DescricaoImovel({ description }: { description: string | null }) {
  if (description === null || description.trim() === '') {
    return null;
  }
  return (
    <section aria-label="Descrição">
      <h2 className="secao__titulo">Descrição</h2>
      <p className="descricao">{description}</p>
    </section>
  );
}

/** Anúncio que saiu do ar (410). Não é beco sem saída: leva para o que existe. */
export function AvisoIndisponivel({
  reason,
  neighborhood,
  city,
}: {
  reason: 'UNPUBLISHED' | 'RENTED_OR_SOLD';
  neighborhood: string | null;
  city: string | null;
}) {
  const onde = [neighborhood, city].filter(Boolean).join(', ');
  return (
    <section className="indisponivel">
      <h1 className="indisponivel__titulo">Este anúncio saiu do ar</h1>
      <p>
        {reason === 'RENTED_OR_SOLD'
          ? 'O imóvel foi alugado ou vendido.'
          : 'A imobiliária tirou este anúncio do portal.'}
        {onde === '' ? '' : ` Veja outros imóveis no ${onde}.`}
      </p>
    </section>
  );
}
