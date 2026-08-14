import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';
import { MembersClient } from './members-client';

export const metadata: Metadata = { title: 'Usuários e equipe | Aluguei.app' };
export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  let me: { activeOrg: { id: string } | null };
  try {
    me = await apiFetch<{ activeOrg: { id: string } | null }>('/auth/me');
  } catch {
    redirect('/login');
  }
  if (!me.activeOrg) {
    redirect('/register');
  }
  return <MembersClient orgId={me.activeOrg.id} />;
}
