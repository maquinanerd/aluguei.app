import type { Metadata } from 'next';
import { OrganizationDetailClient } from './organization-detail-client';

export const metadata: Metadata = { title: 'Imobiliária | Admin da plataforma' };
export const dynamic = 'force-dynamic';

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrganizationDetailClient id={id} />;
}
