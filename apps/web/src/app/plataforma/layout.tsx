import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { PlatformShell } from '@/components/platform/platform-shell';

export const dynamic = 'force-dynamic';

interface MeDto {
  user: { name: string; email: string };
  activeOrg: { id: string } | null;
  platformAdmin: boolean;
}

/** Área do admin da plataforma: só e-mails da allowlist; os demais recebem 404. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  assertSecureApiBase();
  let me: MeDto;
  try {
    me = await apiFetch<MeDto>('/auth/me');
  } catch {
    redirect('/login');
  }
  if (!me.platformAdmin) {
    notFound();
  }
  return (
    <PlatformShell user={me.user} hasOrganization={me.activeOrg !== null}>
      {children}
    </PlatformShell>
  );
}
