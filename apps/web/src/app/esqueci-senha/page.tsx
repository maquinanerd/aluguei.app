import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
