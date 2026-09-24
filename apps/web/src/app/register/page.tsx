import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { planoInicialValido } from '@/lib/cadastro-etapas';
import { RegisterForm } from './register-form';
import type { PlanoDoCadastro } from './register-form';

export const metadata: Metadata = { title: 'Criar conta' };

/** A lista de planos vem da API a cada acesso; `?plano=` é escolha de quem chega. */
export const dynamic = 'force-dynamic';

interface PlanoPublico {
  code: string;
  name: string;
  description: string | null;
  maxUsers: number | null;
  maxPublishedListings: number | null;
  maxActiveLeases: number | null;
}

/** Como o plano é cobrado, na ordem em que os limites apertam (igual ao portal). */
function cobranca(plano: PlanoPublico): string {
  if (plano.maxActiveLeases !== null) {
    return `Até ${String(plano.maxActiveLeases)} contratos de locação ativos`;
  }
  if (plano.maxUsers !== null) {
    return `Até ${String(plano.maxUsers)} usuários`;
  }
  if (plano.maxPublishedListings !== null) {
    return `Até ${String(plano.maxPublishedListings)} anúncios publicados`;
  }
  return 'Sem limite de uso';
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  assertSecureApiBase();
  const { plano } = await searchParams;
  const pedido = typeof plano === 'string' ? plano : null;

  const dados = await apiFetch<{ plans: PlanoPublico[] }>('/public/plans').catch(() => ({
    plans: [] as PlanoPublico[],
  }));

  const planos: PlanoDoCadastro[] = dados.plans.map((item) => ({
    code: item.code,
    name: item.name,
    description: item.description,
    cobranca: cobranca(item),
  }));

  const planoInicial = planoInicialValido(
    planos.map((item) => item.code),
    pedido,
  );

  return (
    <AuthShell>
      <RegisterForm planos={planos} planoInicial={planoInicial} />
    </AuthShell>
  );
}
