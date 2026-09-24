import type { Metadata } from 'next';
import { AcceptInviteForm } from './accept-invite-form';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = { title: 'Convite' };

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell>
      <AcceptInviteForm token={typeof token === 'string' ? token : ''} />
    </AuthShell>
  );
}
