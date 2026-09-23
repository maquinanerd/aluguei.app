import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { PlatformShell } from '@/components/platform/platform-shell';

import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

/** Todas as telas do administracao da plataforma levam o nome do lado pago. */
export const metadata: Metadata = {
  title: { default: BRAND.b2bName, template: `%s | ${BRAND.b2bName}` },
};

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
