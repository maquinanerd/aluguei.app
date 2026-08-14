import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Group, Stack } from '@aluguei/ui';
import { formatBRL, formatArea } from '@aluguei/ui';
import { fetchPublicListings } from '@/lib/public-api';
import { label, PROPERTY_TYPE_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: 'Imóveis | Aluguei.app' };
export const dynamic = 'force-dynamic';

export default async function ImoveisPage() {
  const { listings } = await fetchPublicListings();

  return (
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <span className="peg-group" style={{ gap: 8 }}>
          <span className="app-sidebar__logo">A</span>
          <strong style={{ fontSize: 15 }}>Aluguei.app</strong>
        </span>
        <span className="peg-spacer" />
        <Link href="/" style={{ fontSize: 13, fontWeight: 500 }}>
          Início
        </Link>
        <Link href="/login" className="peg-btn peg-btn--secondary peg-btn--sm">
          Entrar
        </Link>
      </nav>
      <main className="app-page" style={{ padding: '32px 24px' }}>
        <div>
          <h1 className="app-page__title">Imóveis para locação</h1>
          <p className="app-page__desc">Imóveis disponíveis publicados pela imobiliária.</p>
        </div>
        {listings.length === 0 ? (
          <Card>
            <div className="peg-empty" style={{ padding: 32 }}>
              <span className="peg-empty__body">Nenhum imóvel disponível no momento.</span>
            </div>
          </Card>
        ) : (
          <div className="peg-grid cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/imoveis/${listing.slug}`}
                className="peg-card"
                style={{
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  color: 'var(--peg-text-primary)',
                  textDecoration: 'none',
                }}
              >
                <Group between>
                  <Badge tone="success">Publicado</Badge>
                  <Badge tone="neutral">{label(PROPERTY_TYPE_LABELS, listing.propertyType)}</Badge>
                </Group>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{listing.title}</span>
                <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                  {listing.publicAddress?.city ?? ''}
                  {listing.publicAddress?.neighborhood ? ` · ${listing.publicAddress.neighborhood}` : ''}
                  {listing.publicAddress?.state ? ` · ${listing.publicAddress.state}` : ''}
                </span>
                <Stack gap={1}>
                  <Group gap={2} wrap>
                    {listing.bedrooms !== null ? <Badge tone="neutral">{`${String(listing.bedrooms)} dorm.`}</Badge> : null}
                    {listing.bathrooms !== null ? <Badge tone="neutral">{`${String(listing.bathrooms)} ban.`}</Badge> : null}
                    {listing.parkingSpots !== null ? <Badge tone="neutral">{`${String(listing.parkingSpots)} vagas`}</Badge> : null}
                    {listing.totalAreaSqm !== null ? <Badge tone="neutral">{formatArea(listing.totalAreaSqm)}</Badge> : null}
                  </Group>
                  {listing.furnished ? <Badge tone="neutral">Mobiliado</Badge> : null}
                </Stack>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{formatBRL(listing.priceCents)}/mês</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
