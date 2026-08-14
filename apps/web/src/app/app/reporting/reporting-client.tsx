'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Icon,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, EmptyState, ErrorState } from '@aluguei/ui';
import { label, FUNNEL_LABELS } from '@/lib/labels';

interface FunnelPoint {
  period: string;
  status: string;
  count: number;
}

interface RevenueMonth {
  month: string;
  amountCents: number;
}

interface MetaSpend {
  totalSpendCents: number;
  byCampaign: Array<{ campaignId: string; spendCents: number }>;
}

const EXPORT_KINDS = [
  { value: 'leads', label: 'Leads' },
  { value: 'charges', label: 'Cobranças' },
  { value: 'payments', label: 'Pagamentos' },
  { value: 'payouts', label: 'Repasses' },
  { value: 'inspections', label: 'Vistorias' },
  { value: 'contracts', label: 'Contratos' },
  { value: 'meta_campaigns', label: 'Campanhas Meta' },
];

function ReportingBody() {
  const toast = useToast();
  const [periodDays, setPeriodDays] = useState('7');
  const [exportKind, setExportKind] = useState('leads');
  const [exportFormat, setExportFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);

  const funnelQ = useQuery<{ points: FunnelPoint[] }>(`/reporting/leads-funnel?periodDays=${periodDays}`, [periodDays]);
  const revenueQ = useQuery<{ months: RevenueMonth[] }>('/reporting/revenue-monthly', []);
  const spendQ = useQuery<MetaSpend>('/reporting/meta-spend', []);

  if (funnelQ.permissionDenied) return <PermissionDenied title="Sem acesso a relatórios" />;

  const funnel = useMemo(() => {
    const points = funnelQ.data?.points ?? [];
    const totals = new Map<string, number>();
    for (const p of points) {
      totals.set(p.status, (totals.get(p.status) ?? 0) + p.count);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [funnelQ.data]);

  const maxCount = funnel.reduce((m, [, c]) => Math.max(m, c), 1);

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch(`/api/backend/reporting/export/${exportKind}?format=${exportFormat}&maxRows=1000`, { cache: 'no-store' });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const message = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : 'Falha na exportação';
        toast.error('Falha na exportação', message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportKind}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exportação iniciada', `${exportKind}.${exportFormat}`);
    } catch (err) {
      toast.error('Falha na exportação', err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  const months = revenueQ.data?.months ?? [];
  const maxRevenue = months.reduce((m, x) => Math.max(m, x.amountCents), 0);

  return (
    <div className="app-page">
      <PageToolbar
        title="Relatórios"
        description="KPIs comerciais, de operação e marketing."
        filters={
          <Select
            size="sm"
            value={periodDays}
            onChange={(e) => { setPeriodDays(e.target.value); }}
            options={[
              { value: '1', label: 'Hoje' },
              { value: '7', label: '7 dias' },
              { value: '30', label: '30 dias' },
            ]}
            aria-label="Período do funil"
          />
        }
      />

      <div className="peg-grid cols-2">
        <Card title="Funil de leads" padless>
          {funnel.length === 0 ? (
            <EmptyState title="Sem dados" body="Os pontos do funil aparecerão conforme os leads avançam." icon="pieChart" />
          ) : (
            <Stack gap={3} style={{ padding: 20 }}>
              {funnel.map(([status, count]) => (
                <div key={status} className="peg-stack" style={{ gap: 4 }}>
                  <Group between>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{label(FUNNEL_LABELS, status)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{String(count)}</span>
                  </Group>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--peg-surface-muted)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${String(Math.max(4, (count / maxCount) * 100))}%`,
                        background: status === 'WON' ? 'var(--peg-success)' : status === 'LOST' ? 'var(--peg-danger)' : 'var(--aluguei-brand)',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              ))}
            </Stack>
          )}
        </Card>

        <Card title="Receita mensal (aluguel)" padless>
          {months.length === 0 ? (
            <EmptyState title="Sem dados" body="Receita mensal aparecerá com as cobranças pagas." icon="barChart" />
          ) : (
            <Stack gap={3} style={{ padding: 20 }}>
              {months.map((m) => (
                <div key={m.month} className="peg-stack" style={{ gap: 4 }}>
                  <Group between>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{m.month}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{formatBRL(m.amountCents)}</span>
                  </Group>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--peg-surface-muted)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${String(Math.max(4, (m.amountCents / Math.max(1, maxRevenue)) * 100))}%`,
                        background: 'var(--aluguei-brand)',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              ))}
            </Stack>
          )}
        </Card>
      </div>

      <Card title="Gasto Meta Ads" padless>
        <Stack gap={3} style={{ padding: 20 }}>
          {spendQ.data && spendQ.data.totalSpendCents > 0 ? (
            <>
              <Group gap={2}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{formatBRL(spendQ.data.totalSpendCents)}</span>
                <Badge tone="info">total</Badge>
              </Group>
              {spendQ.data.byCampaign.map((c) => (
                <Group key={c.campaignId} gap={2}>
                  <span className="peg-text-mono peg-text-tertiary" style={{ fontSize: 11 }}>{c.campaignId.slice(0, 8)}</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{formatBRL(c.spendCents)}</span>
                </Group>
              ))}
            </>
          ) : (
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>Nenhum gasto registrado (modo dry-run).</span>
          )}
        </Stack>
      </Card>

      <Card title="Exportar dados" padless>
        <Stack gap={3} style={{ padding: 20 }}>
          <div className="peg-grid cols-3">
            <Select
              label="Tipo"
              value={exportKind}
              onChange={(e) => { setExportKind(e.target.value); }}
              options={EXPORT_KINDS}
            />
            <Select
              label="Formato"
              value={exportFormat}
              onChange={(e) => { setExportFormat(e.target.value); }}
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'json', label: 'JSON' },
              ]}
            />
            <div className="peg-group" style={{ alignItems: 'flex-end' }}>
              <Button variant="brand" loading={exporting} onClick={() => { void exportData(); }} icon={<Icon name="download" size={14} />}>
                Exportar
              </Button>
            </div>
          </div>
          <p className="peg-text-tertiary" style={{ fontSize: 12 }}>
            Limite de 10.000 linhas por exportação. Histórico e agendamento são responsabilidade do domínio.
          </p>
        </Stack>
      </Card>

      {funnelQ.error ? <ErrorState body={funnelQ.error} onRetry={funnelQ.reload} /> : null}
    </div>
  );
}

export function ReportingClient() {
  return (
    <ToastProvider>
      <ReportingBody />
    </ToastProvider>
  );
}
