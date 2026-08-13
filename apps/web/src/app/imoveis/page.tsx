import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchPublicListings, formatBRL } from '@/lib/public-api';

export const metadata: Metadata = { title: 'Imóveis | Aluguei.app' };
export const dynamic = 'force-dynamic';

export default async function ImoveisPage() {
  const { listings } = await fetchPublicListings();

  return (
    <main className="public-listings">
      <h1>Imóveis para locação</h1>
      {listings.length === 0 ? (
        <p>Nenhum imóvel disponível no momento.</p>
      ) : (
        <ul>
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link href={`/imoveis/${listing.slug}`}>
                <h2>{listing.title}</h2>
              </Link>
              <p>
                {listing.publicAddress?.city ?? ''}
                {listing.publicAddress?.neighborhood
                  ? ` · ${listing.publicAddress.neighborhood}`
                  : ''}
                {listing.bedrooms !== null ? ` · ${String(listing.bedrooms)} quartos` : ''}
              </p>
              <p className="price">{formatBRL(listing.priceCents)}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
