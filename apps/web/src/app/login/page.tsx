import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <AuthShell rotulo="Entrar">
      <LoginForm />
    </AuthShell>
  );
}
