import type { Metadata } from 'next';
import { Badge, Card, Group, Stack } from '@aluguei/ui';
import type { PlanModule } from '@aluguei/domain';
import { PageToolbar } from '@/components/page-toolbar';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';
import { MODULOS_DO_PLANO, NOME_DO_MODULO } from '@/lib/plan-modules';
import { PermissionDenied } from '@aluguei/ui';

export const metadata: Metadata = { title: 'Plano e uso' };
export const dynamic = 'force-dynamic';

interface PlanoEUso {
  plan: {
    code: string;
    name: string;
    modules: PlanModule[];
    monthlyPriceCents: number | null;
    limits: {
      maxUsers: number | null;
      maxProperties: number | null;
      maxPublishedListings: number | null;
      maxActiveLeases: number | null;
    };
  };
  usage: {
    users: number;
    properties: number;
    publishedListings: number;
    activeLeases: number;
  };
  since: string;
}

/** "3 de 5" ou "3 · sem limite": limite nulo é ilimitado, nunca zero. */
function usoLegivel(usado: number, limite: number | null): string {
  return limite === null
    ? `${String(usado)} · sem limite`
    : `${String(usado)} de ${String(limite)}`;
}

/** Perto do teto é aviso, no teto é bloqueio — a cor acompanha o que vai acontecer. */
function tom(usado: number, limite: number | null): 'neutral' | 'warning' | 'danger' {
  if (limite === null) {
    return 'neutral';
  }
  if (usado >= limite) {
    return 'danger';
  }
  return usado >= limite * 0.8 ? 'warning' : 'neutral';
}

const LINHAS = [
  { chave: 'users', rotulo: 'Usuários', limite: 'maxUsers' },
  { chave: 'properties', rotulo: 'Imóveis cadastrados', limite: 'maxProperties' },
  { chave: 'publishedListings', rotulo: 'Anúncios publicados', limite: 'maxPublishedListings' },
  { chave: 'activeLeases', rotulo: 'Contratos de locação ativos', limite: 'maxActiveLeases' },
] as const;

/**
 * Plano e uso (Onda 4). Os números vêm do mesmo `loadPlanUsage` que decide se
 * um cadastro cabe no plano — a tela mostra o número que o sistema vai usar
 * para recusar, não uma contagem paralela que pode divergir dele.
 */
export default async function PlanoEUsoPage() {
  assertSecureApiBase();
  const me = await apiFetch<{ activeOrg: { id: string } | null }>('/auth/me');
  if (me.activeOrg === null) {
    return <PermissionDenied title="Sem imobiliária ativa" />;
  }

  const dados = await apiFetch<PlanoEUso>(`/organizations/${me.activeOrg.id}/plan-usage`).catch(
    () => null,
  );
  if (dados === null) {
    return <PermissionDenied title="Sem acesso ao plano" />;
  }

  const desde = new Date(dados.since).toLocaleDateString('pt-BR');

  return (
    <div className="app-page">
      <PageToolbar
        title="Plano e uso"
        description="O que o seu plano inclui e quanto já foi usado."
      />

      <div className="peg-grid cols-2" style={{ alignItems: 'start' }}>
        <Card title="Plano atual" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            <Group gap={2}>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{dados.plan.name}</span>
              <Badge tone="neutral">{dados.plan.code}</Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              Desde {desde}
            </span>
            <p className="peg-text-secondary" style={{ fontSize: 13, margin: 0 }}>
              Quem troca o plano é a equipe da plataforma. Fale com quem cuida da sua conta para
              pedir a troca; nada do que você já tem é apagado, e os módulos fora do plano continuam
              visíveis com cadeado.
            </p>
          </Stack>
        </Card>

        <Card title="Uso" padless>
          <Stack gap={2} style={{ padding: 20 }}>
            {LINHAS.map((linha) => {
              const usado = dados.usage[linha.chave];
              const limite = dados.plan.limits[linha.limite];
              return (
                <Group key={linha.chave} between>
                  <span style={{ fontSize: 14 }}>{linha.rotulo}</span>
                  <Badge tone={tom(usado, limite)}>{usoLegivel(usado, limite)}</Badge>
                </Group>
              );
            })}
          </Stack>
        </Card>

        <Card title="Módulos do plano" padless>
          <Stack gap={2} style={{ padding: 20 }}>
            {MODULOS_DO_PLANO.map((modulo) => {
              const incluido = dados.plan.modules.includes(modulo);
              return (
                <Group key={modulo} between>
                  <span style={{ fontSize: 14 }}>{NOME_DO_MODULO[modulo]}</span>
                  <Badge tone={incluido ? 'success' : 'neutral'}>
                    {incluido ? 'Incluído' : 'Fora do plano'}
                  </Badge>
                </Group>
              );
            })}
          </Stack>
        </Card>
      </div>
    </div>
  );
}
