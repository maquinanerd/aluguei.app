import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = { title: 'Redefinir senha' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell>
      <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
    </AuthShell>
  );
}
