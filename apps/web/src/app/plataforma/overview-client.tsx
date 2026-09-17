'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, DataTable, ErrorState, Kpi } from '@aluguei/ui';
import { PageToolbar } from '@/components/page-toolbar';
import { useQuery } from '@/lib/use-query';
import type { PlatformOrganizationList } from '@/lib/platform';
import { organizationColumns } from './imobiliarias/organizations-client';

/** Visão geral: contagem por situação e a fila de cadastros aguardando análise. */
export function OverviewClient() {
  const router = useRouter();
  const pending = useQuery<PlatformOrganizationList>(
    '/platform/organizations?status=PENDING_APPROVAL&limit=20',
  );
  const counts = pending.data?.counts;
  const value = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('pt-BR'));

  return (
    <div className="app-page">
      <PageToolbar
        title="Admin da plataforma"
        description="Cadastros de imobiliárias, aprovação e planos."
      />
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        <Kpi label="Em análise" value={value(counts?.PENDING_APPROVAL)} icon="clock" />
        <Kpi label="Ativas" value={value(counts?.ACTIVE)} icon="checkCircle" />
        <Kpi label="Suspensas" value={value(counts?.SUSPENDED)} icon="alertTriangle" />
        <Kpi label="Recusadas" value={value(counts?.REJECTED)} icon="x" />
      </div>
      <Card
        title="Fila de aprovação"
        actions={
          <Link href="/plataforma/imobiliarias?status=PENDING_APPROVAL" style={{ fontSize: 13 }}>
            Ver todas
          </Link>
        }
        padless
      >
        <DataTable
          columns={organizationColumns}
          rows={pending.data?.organizations ?? []}
          loading={pending.loading}
          emptyTitle="Nenhum cadastro aguardando"
          emptyBody="Novos cadastros de imobiliárias aparecem aqui, dos mais antigos para os mais novos."
          onRowClick={(org) => {
            router.push(`/plataforma/imobiliarias/${org.id}`);
          }}
        />
      </Card>
      {pending.error ? <ErrorState body={pending.error} onRetry={pending.reload} /> : null}
    </div>
  );
}
