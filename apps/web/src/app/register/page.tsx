import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Criar conta | Aluguei.app' };

export default function RegisterPage() {
  return <RegisterForm />;
}
