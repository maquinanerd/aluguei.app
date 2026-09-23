import type { Metadata } from 'next';
import type { PlanModule } from '@aluguei/domain';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { PlanoBloqueado } from '@/components/shell/plano-bloqueado';
import { moduloDe } from '@/lib/plan-modules';
import type { SessionPlan } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fora do seu plano',
};

/** Módulos cujas telas ainda não existem (fase de Vendas, ADR-097). */
const EM_PREPARACAO: readonly PlanModule[] = ['VENDAS'];

export default async function PlanoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = params.modulo;
  const modulo = moduloDe(Array.isArray(bruto) ? bruto[0] : bruto);

  assertSecureApiBase();
  const me = await apiFetch<{ plan: SessionPlan | null }>('/auth/me');
  const plano = me.plan;
  const temModulo = modulo ? (plano?.modules.includes(modulo) ?? false) : false;

  return (
    <PlanoBloqueado
      modulo={modulo}
      plano={plano}
      emPreparacao={modulo !== null && temModulo && EM_PREPARACAO.includes(modulo)}
    />
  );
}
