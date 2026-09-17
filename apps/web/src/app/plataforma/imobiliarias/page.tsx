import type { Metadata } from 'next';
import { OrganizationsClient } from './organizations-client';
import type { StatusFilter } from './organizations-client';

export const metadata: Metadata = { title: 'Imobiliárias | Admin da plataforma' };
export const dynamic = 'force-dynamic';

const STATUSES: readonly string[] = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED'];

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const initialStatus = (status && STATUSES.includes(status) ? status : 'ALL') as StatusFilter;
  return <OrganizationsClient initialStatus={initialStatus} />;
}
