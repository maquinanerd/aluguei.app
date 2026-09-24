import type { PublicListingCard } from '@aluguei/contracts';
import type { ImovelResumo } from '@/components/ImovelCard';
import { tipoDoDominio } from './rotas';
import type { TipoImovel } from './tipos';

/**
 * Card da API → card do design. A fronteira existe de propósito: o componente é
 * do portal e fala o vocabulário do design (tipo em slug, finalidade em
 * português); o contrato é da API. Mudar um lado não arrasta o outro.
 */

/**
 * `LAND` (terreno) não tem cor no pacote de design. Até o designer decidir, ele
 * cai no cinza neutro de sala/loja, que é a cor "outros" da paleta — está
 * registrado como pendência em `docs/frontend/ACHOUIMOVEL_PLAN.md`.
 */
const TIPO_PADRAO: TipoImovel = 'sala-loja';

export function imovelDaApi(card: PublicListingCard): ImovelResumo {
  const tipo = tipoDoDominio(card.propertyType) ?? TIPO_PADRAO;
  const finalidade =
    card.purpose === 'BOTH' ? 'ambos' : card.purpose === 'SALE' ? 'venda' : 'aluguel';

  return {
    slug: card.slug,
    tipo,
    finalidade,
    bairro: card.neighborhood ?? '',
    cidade: card.city ?? '',
    uf: card.state ?? '',
    aluguelCents: card.monthlyRentCents,
    condominioCents: card.condoFeeCents,
    iptuCents: card.iptuCents,
    totalMensalCents: card.totalMonthlyCents,
    precoVendaCents: card.salePriceCents,
    quartos: card.bedrooms,
    banheiros: card.bathrooms,
    vagas: card.parkingSpots,
    areaM2: card.areaSqm,
    fotos: card.photoCount,
    fotoUrl: card.coverPath,
    fotoLegenda: card.coverCaption,
    anunciante: card.org.creci === null ? null : { nome: card.org.name, creci: card.org.creci },
  };
}
