import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { AppShell } from '@/components/shell/app-shell';
import type { Session } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function loadSession(): Promise<Session> {
  assertSecureApiBase();
  const me = await apiFetch<{
    user: { id: string; email: string; name: string };
    activeOrg: { id: string; name: string; slug: string } | null;
    memberships: Array<{ id: string; orgId: string; role: string; createdAt: string }>;
  }>('/auth/me');
  return {
    user: me.user,
    activeOrg: me.activeOrg,
    memberships: me.memberships as Session['memberships'],
  };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  let session: Session;
  try {
    session = await loadSession();
  } catch {
    redirect('/login');
  }
  if (!session.activeOrg) {
    // Sem organização: register criou org; fallback para registro.
    redirect('/register');
  }
  return <AppShell session={session}>{children}</AppShell>;
}
