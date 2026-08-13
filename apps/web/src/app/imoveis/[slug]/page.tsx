import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPublicListing, formatBRL } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await fetchPublicListing(slug);
  return { title: listing ? `${listing.title} | Aluguei.app` : 'Imóvel | Aluguei.app' };
}

export default async function ImovelPage({ params }: PageProps) {
  const { slug } = await params;
  const listing = await fetchPublicListing(slug);
  if (!listing) {
    notFound();
  }

  return (
    <main className="public-listing-detail">
      <h1>{listing.title}</h1>
      <p className="price">{formatBRL(listing.priceCents)}/mês</p>
      <p>
        {listing.publicAddress?.city ?? ''}
        {listing.publicAddress?.neighborhood ? ` · ${listing.publicAddress.neighborhood}` : ''}
        {listing.publicAddress?.state ? ` · ${listing.publicAddress.state}` : ''}
      </p>
      <ul className="specs">
        {listing.bedrooms !== null ? <li>{listing.bedrooms} quartos</li> : null}
        {listing.bathrooms !== null ? <li>{listing.bathrooms} banheiros</li> : null}
        {listing.parkingSpots !== null ? <li>{listing.parkingSpots} vagas</li> : null}
        {listing.furnished ? <li>Mobiliado</li> : null}
        {listing.petsAllowed !== null ? (
          <li>{listing.petsAllowed ? 'Aceita pets' : 'Não aceita pets'}</li>
        ) : null}
        {listing.totalAreaSqm !== null ? <li>{listing.totalAreaSqm} m²</li> : null}
      </ul>
      {listing.description ? <p>{listing.description}</p> : null}
      {listing.features.length > 0 ? (
        <ul className="features">
          {listing.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
