import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { AppShell } from '@/components/shell/app-shell';
import type { Session } from '@/lib/session';
import { destinationFor } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

async function loadSession(): Promise<Session> {
  assertSecureApiBase();
  const me = await apiFetch<{
    user: { id: string; email: string; name: string };
    activeOrg: Session['activeOrg'];
    memberships: Array<{ id: string; orgId: string; role: string; createdAt: string }>;
    platformAdmin: boolean;
  }>('/auth/me');
  return {
    user: me.user,
    activeOrg: me.activeOrg,
    memberships: me.memberships as Session['memberships'],
    platformAdmin: me.platformAdmin,
  };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  let session: Session;
  try {
    session = await loadSession();
  } catch {
    redirect('/login');
  }
  // Painel só com imobiliária ativa: em análise, suspensa ou recusada vai à situação da conta;
  // admin da plataforma sem imobiliária vai à plataforma; sem nada, ao cadastro.
  if (session.activeOrg?.status !== 'ACTIVE') {
    redirect(destinationFor(session));
  }
  return <AppShell session={session}>{children}</AppShell>;
}
