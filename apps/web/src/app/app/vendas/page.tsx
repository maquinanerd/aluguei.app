import type { Metadata } from 'next';
import { Badge, Card, Group, PermissionDenied, Stack } from '@aluguei/ui';
import { formatBRL } from '@aluguei/ui';
import { PageToolbar } from '@/components/page-toolbar';
import { apiFetch, assertSecureApiBase } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Vendas' };
export const dynamic = 'force-dynamic';

interface PainelDeVendas {
  month: string;
  closed: { count: number; volumeCents: number; commissionCents: number };
  open: { count: number; volumeCents: number };
  lost: { count: number };
}

/** "2026-09" vira "setembro de 2026", sem inventar dia. */
function mesLegivel(mes: string): string {
  const [ano, numero] = mes.split('-');
  const data = new Date(Date.UTC(Number(ano), Number(numero) - 1, 1));
  return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Painel de vendas do mês (Onda 5).
 *
 * Fechadas contam pelo valor que fechou; abertas, pelo que está em jogo. São
 * dois números diferentes de propósito — somar os dois daria um "total" que não
 * corresponde a dinheiro nenhum.
 */
export default async function VendasPage() {
  assertSecureApiBase();
  const painel = await apiFetch<PainelDeVendas>('/sale-negotiations/summary').catch(() => null);
  if (painel === null) {
    return <PermissionDenied title="Sem acesso ao painel de vendas" />;
  }

  return (
    <div className="app-page">
      <PageToolbar title="Vendas" description={`Negociações de ${mesLegivel(painel.month)}.`} />

      <div className="peg-grid cols-3" style={{ alignItems: 'start' }}>
        <Card title="Fechadas no mês" padless>
          <Stack gap={2} style={{ padding: 20 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{painel.closed.count}</span>
            <Group between>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Valor geral de venda
              </span>
              <span style={{ fontWeight: 600 }}>{formatBRL(painel.closed.volumeCents)}</span>
            </Group>
            <Group between>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Comissão
              </span>
              <span style={{ fontWeight: 600 }}>{formatBRL(painel.closed.commissionCents)}</span>
            </Group>
          </Stack>
        </Card>

        <Card title="Em negociação" padless>
          <Stack gap={2} style={{ padding: 20 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{painel.open.count}</span>
            <Group between>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Valor em jogo
              </span>
              <span style={{ fontWeight: 600 }}>{formatBRL(painel.open.volumeCents)}</span>
            </Group>
            <span className="peg-text-tertiary" style={{ fontSize: 11 }}>
              É o último valor proposto, não receita: pode subir, cair ou não acontecer.
            </span>
          </Stack>
        </Card>

        <Card title="Perdidas" padless>
          <Stack gap={2} style={{ padding: 20 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{painel.lost.count}</span>
            <Badge tone="neutral">total acumulado</Badge>
          </Stack>
        </Card>
      </div>
    </div>
  );
}
