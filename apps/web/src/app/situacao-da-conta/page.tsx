import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { ACCOUNT_STATUS_COPY, destinationFor } from '@/lib/account-status';
import type { OrganizationStatus } from '@/lib/account-status';
import { LogoutButton } from '@/components/logout-button';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = { title: 'Situação da conta' };
export const dynamic = 'force-dynamic';

interface MeDto {
  user: { name: string; email: string };
  activeOrg: {
    id: string;
    name: string;
    status: OrganizationStatus;
    statusReason: string | null;
  } | null;
  platformAdmin: boolean;
}

/** Imobiliária em análise, suspensa ou recusada: explica a situação e oferece sair. */
export default async function AccountStatusPage() {
  assertSecureApiBase();
  let me: MeDto;
  try {
    me = await apiFetch<MeDto>('/auth/me');
  } catch {
    redirect('/login');
  }
  const org = me.activeOrg;
  if (!org || org.status === 'ACTIVE') {
    redirect(destinationFor(me));
  }
  const copy = ACCOUNT_STATUS_COPY[org.status];

  return (
    <AuthShell acaoTopo={<LogoutButton variant="tertiary" />}>
      <div className="peg-stack" style={{ gap: 12 }}>
        <span className={`peg-badge peg-badge--${copy.tone}`} style={{ alignSelf: 'flex-start' }}>
          {org.name}
        </span>
        <h1 id="account-status-title" style={{ fontSize: 20 }}>
          {copy.title}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--peg-text-secondary)' }}>{copy.body}</p>
        {org.statusReason ? (
          <div
            role="note"
            style={{
              padding: '8px 12px',
              background: 'var(--peg-surface-subtle, var(--peg-danger-bg))',
              borderRadius: 'var(--peg-radius-sm)',
              fontSize: 13,
            }}
          >
            <strong>Motivo:</strong> {org.statusReason}
          </div>
        ) : null}
        <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
          Conta: {me.user.name} · {me.user.email}
        </p>
        {me.platformAdmin ? (
          <Link href="/plataforma" style={{ fontWeight: 500, fontSize: 13 }}>
            Abrir o admin da plataforma
          </Link>
        ) : null}
      </div>
    </AuthShell>
  );
}
