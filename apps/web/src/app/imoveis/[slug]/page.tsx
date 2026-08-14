import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Breadcrumb, Card, Group, Stack, Tag } from '@aluguei/ui';
import { formatBRL, formatArea } from '@aluguei/ui';
import { fetchPublicListing } from '@/lib/public-api';
import { label, PROPERTY_TYPE_LABELS } from '@/lib/labels';

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
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <span className="peg-group" style={{ gap: 8 }}>
          <span className="app-sidebar__logo">A</span>
          <strong style={{ fontSize: 15 }}>Aluguei.app</strong>
        </span>
        <span className="peg-spacer" />
        <Link href="/imoveis" style={{ fontSize: 13, fontWeight: 500 }}>
          Imóveis
        </Link>
        <Link href="/login" className="peg-btn peg-btn--secondary peg-btn--sm">
          Entrar
        </Link>
      </nav>
      <main className="app-page" style={{ padding: '32px 24px', maxWidth: 860 }}>
        <Breadcrumb
          items={[
            { label: 'Início', href: '/' },
            { label: 'Imóveis', href: '/imoveis' },
            { label: listing.title },
          ]}
        />
        <Card padless>
          <Stack gap={4} style={{ padding: 24 }}>
            <Group between wrap gap={3}>
              <h1 style={{ fontSize: 22 }}>{listing.title}</h1>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{formatBRL(listing.priceCents)}/mês</span>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 14 }}>
              {listing.publicAddress?.city ?? ''}
              {listing.publicAddress?.neighborhood ? ` · ${listing.publicAddress.neighborhood}` : ''}
              {listing.publicAddress?.state ? ` · ${listing.publicAddress.state}` : ''}
            </span>
            <Group gap={2} wrap>
              {listing.bedrooms !== null ? <Tag icon="home">{`${String(listing.bedrooms)} dorm.`}</Tag> : null}
              {listing.bathrooms !== null ? <Tag icon="home">{`${String(listing.bathrooms)} ban.`}</Tag> : null}
              {listing.parkingSpots !== null ? <Tag icon="home">{`${String(listing.parkingSpots)} vagas`}</Tag> : null}
              {listing.totalAreaSqm !== null ? <Tag icon="mapPin">{formatArea(listing.totalAreaSqm)}</Tag> : null}
              {listing.furnished ? <Tag icon="check">Mobiliado</Tag> : null}
              {listing.petsAllowed !== null ? (
                <Tag icon={listing.petsAllowed ? 'check' : 'x'}>{listing.petsAllowed ? 'Aceita pets' : 'Não aceita pets'}</Tag>
              ) : null}
            </Group>
            <Badge tone="neutral">{label(PROPERTY_TYPE_LABELS, listing.propertyType)}</Badge>
            {listing.description ? (
              <p style={{ fontSize: 14, lineHeight: '22px' }}>{listing.description}</p>
            ) : null}
            {listing.features.length > 0 ? (
              <Stack gap={2}>
                <span className="peg-text-tertiary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Características
                </span>
                <Group gap={2} wrap>
                  {listing.features.map((f) => (
                    <Tag key={f} icon="check">
                      {f}
                    </Tag>
                  ))}
                </Group>
              </Stack>
            ) : null}
          </Stack>
        </Card>
        <p style={{ marginTop: 16 }}>
          <Link href="/imoveis" style={{ fontSize: 13 }}>
            ← Voltar para imóveis
          </Link>
        </p>
      </main>
    </div>
  );
}
