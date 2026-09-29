'use client';

import { useState } from 'react';
import { Badge, Button, Card, Group, Input, Stack } from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';

/**
 * Exclusividade de venda na tela do imóvel (Onda 5).
 *
 * A situação e os dias restantes vêm calculados da API. A tela não recalcula
 * prazo de propósito: duas contas divergem exatamente no dia do vencimento, que
 * é o dia em que a imobiliária precisa agir.
 */

interface Exclusividade {
  id: string;
  startsOn: string;
  endsOn: string;
  canceledReason: string | null;
  state: 'SCHEDULED' | 'ACTIVE' | 'ENDING_SOON' | 'EXPIRED' | 'CANCELED';
  daysLeft: number;
  totalDays: number;
}

const ESTADO_ROTULO: Record<Exclusividade['state'], string> = {
  SCHEDULED: 'agendada',
  ACTIVE: 'em vigor',
  ENDING_SOON: 'termina em breve',
  EXPIRED: 'vencida',
  CANCELED: 'cancelada',
};

const ESTADO_TOM: Record<Exclusividade['state'], 'neutral' | 'success' | 'warning'> = {
  SCHEDULED: 'neutral',
  ACTIVE: 'success',
  ENDING_SOON: 'warning',
  EXPIRED: 'neutral',
  CANCELED: 'neutral',
};

export function ExclusividadeVenda({ propertyId }: { propertyId: string }) {
  const [recarregar, setRecarregar] = useState(0);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const consulta = useQuery<{ exclusivities: Exclusividade[]; current: Exclusividade | null }>(
    `/properties/${propertyId}/sale-exclusivities?t=${String(recarregar)}`,
    [propertyId, recarregar],
  );

  async function registrar(): Promise<void> {
    setErro(null);
    setOcupado(true);
    try {
      await apiClient(`/properties/${propertyId}/sale-exclusivities`, {
        method: 'POST',
        body: { startsOn: inicio, endsOn: fim },
      });
      setInicio('');
      setFim('');
      setRecarregar((valor) => valor + 1);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao registrar');
    } finally {
      setOcupado(false);
    }
  }

  const vigente = consulta.data?.current ?? null;
  const historico = (consulta.data?.exclusivities ?? []).filter((item) => item.id !== vigente?.id);

  return (
    <Card title="Exclusividade de venda" padless>
      <Stack gap={3} style={{ padding: 20 }}>
        {vigente === null ? (
          <span className="peg-text-secondary" style={{ fontSize: 13 }}>
            Sem exclusividade em vigor. O imóvel continua publicado normalmente — exclusividade é
            acordo comercial, não estado do anúncio.
          </span>
        ) : (
          <Stack gap={1}>
            <Group gap={2}>
              <Badge tone={ESTADO_TOM[vigente.state]}>{ESTADO_ROTULO[vigente.state]}</Badge>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                {formatDate(vigente.startsOn)} a {formatDate(vigente.endsOn)} · {vigente.totalDays}{' '}
                dias
              </span>
            </Group>
            <span
              style={{
                fontSize: 13,
                color: vigente.state === 'ENDING_SOON' ? 'var(--peg-warning)' : undefined,
              }}
            >
              {vigente.daysLeft === 0
                ? 'Termina hoje.'
                : `Faltam ${String(vigente.daysLeft)} dias.`}
              {vigente.state === 'ENDING_SOON'
                ? ' Renove antes do fim para não perder o imóvel.'
                : ''}
            </span>
          </Stack>
        )}

        <Group gap={2} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Input
            size="sm"
            type="date"
            label="Início"
            value={inicio}
            onChange={(evento) => {
              setInicio(evento.target.value);
            }}
          />
          <Input
            size="sm"
            type="date"
            label="Fim"
            value={fim}
            onChange={(evento) => {
              setFim(evento.target.value);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={ocupado}
            disabled={inicio === '' || fim === ''}
            onClick={() => {
              void registrar();
            }}
          >
            Registrar período
          </Button>
        </Group>
        {erro === null ? null : (
          <span role="alert" style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
            {erro}
          </span>
        )}

        {historico.length === 0 ? null : (
          <Stack gap={1}>
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              Períodos anteriores
            </span>
            {historico.map((item) => (
              <Group key={item.id} between>
                <span style={{ fontSize: 13 }}>
                  {formatDate(item.startsOn)} a {formatDate(item.endsOn)}
                </span>
                <Badge tone="neutral">{ESTADO_ROTULO[item.state]}</Badge>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
