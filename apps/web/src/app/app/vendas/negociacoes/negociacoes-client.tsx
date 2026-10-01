'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Group,
  Input,
  PermissionDenied,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { useLookup } from '@/lib/lookup';
import { PageToolbar } from '@/components/page-toolbar';
import {
  COLUNAS_DO_QUADRO,
  ETAPA_ROTULO,
  ETAPA_TOM,
  LADO_DOCUMENTO_ROTULO,
  PAPEL_COMISSAO_ROTULO,
  RESULTADO_EVENTO_ROTULO,
  RESULTADO_EVENTO_TOM,
  TIPO_EVENTO_ROTULO,
  percentualLegivel,
} from '@/lib/vendas';
import type { EtapaNegociacao, Negociacao, NegociacaoDetalhe } from '@/lib/vendas';

/**
 * Negociações de venda (Onda 5): quadro por etapa e gaveta com a conversa.
 *
 * A gaveta mostra o **histórico inteiro** de propósito — pedido, proposta,
 * contraproposta e resposta. É com ele que se negocia; só o último valor não
 * diz se o comprador está subindo ou o proprietário cedendo.
 */

interface ListaResposta {
  negotiations: Negociacao[];
  total: number;
  /** Todas as etapas, inclusive as vazias contando zero (a API preenche). */
  byStage: Record<EtapaNegociacao, number>;
}

function NegociacoesBody() {
  const toast = useToast();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recarregar, setRecarregar] = useState(0);

  const lista = useQuery<ListaResposta>(`/sale-negotiations?limit=100&t=${String(recarregar)}`, [
    recarregar,
  ]);
  const detalhe = useQuery<{ negotiation: NegociacaoDetalhe }>(
    abertaId === null ? null : `/sale-negotiations/${abertaId}?t=${String(recarregar)}`,
    [abertaId, recarregar],
  );

  const negociacoes = lista.data?.negotiations ?? [];
  const imoveis = useLookup<{ id: string; title: string }>(
    'properties',
    negociacoes.map((negociacao) => negociacao.propertyId),
  ).map;
  const compradores = useLookup<{ id: string; name: string }>(
    'parties',
    negociacoes.map((negociacao) => negociacao.buyerPartyId),
  ).map;

  if (lista.permissionDenied) {
    return <PermissionDenied title="Sem acesso a negociações" />;
  }

  async function executar(caminho: string, body: unknown, sucesso: string): Promise<void> {
    setOcupado(true);
    try {
      await apiClient(caminho, { method: 'POST', body });
      toast.success(sucesso);
      setRecarregar((valor) => valor + 1);
    } catch (err) {
      toast.error('Falha', err instanceof Error ? err.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  const aberta = detalhe.data?.negotiation ?? null;

  return (
    <div className="app-page">
      <PageToolbar
        title="Negociações"
        description="Propostas de venda por etapa, da primeira oferta ao fechamento."
        actions={
          <Link href="/app/vendas" className="peg-btn peg-btn--secondary peg-btn--sm">
            Painel de vendas
          </Link>
        }
      />

      {lista.error ? (
        <ErrorState
          body={lista.error}
          onRetry={() => {
            setRecarregar((valor) => valor + 1);
          }}
        />
      ) : null}

      {lista.loading ? (
        <EmptyState title="Carregando negociações…" icon="activity" />
      ) : negociacoes.length === 0 ? (
        <EmptyState
          title="Nenhuma negociação"
          body="As negociações de venda aparecem aqui assim que a primeira proposta for registrada."
          icon="columns"
        />
      ) : (
        <div className="sale-board">
          {COLUNAS_DO_QUADRO.map((etapa) => {
            const itens = negociacoes.filter((negociacao) => negociacao.stage === etapa);
            return (
              <section key={etapa} className="sale-board__col">
                <Group between className="sale-board__head">
                  <Group gap={2}>
                    <Badge tone={ETAPA_TOM[etapa]}>{ETAPA_ROTULO[etapa]}</Badge>
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                      {lista.data?.byStage[etapa] ?? 0}
                    </span>
                  </Group>
                </Group>
                <Stack gap={2}>
                  {itens.map((negociacao) => (
                    <button
                      key={negociacao.id}
                      type="button"
                      className="peg-card sale-board__card"
                      onClick={() => {
                        setAbertaId(negociacao.id);
                      }}
                    >
                      <Stack gap={1}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>
                          {imoveis.get(negociacao.propertyId)?.title ?? 'Imóvel'}
                        </span>
                        <span className="peg-text-secondary" style={{ fontSize: 12 }}>
                          {compradores.get(negociacao.buyerPartyId)?.name ?? 'Comprador'}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          {formatBRL(negociacao.closedAmountCents ?? negociacao.currentAmountCents)}
                        </span>
                        {negociacao.documents.total > 0 ? (
                          <span className="peg-text-tertiary" style={{ fontSize: 11 }}>
                            {negociacao.documents.provided} de {negociacao.documents.total}{' '}
                            documentos
                          </span>
                        ) : null}
                      </Stack>
                    </button>
                  ))}
                </Stack>
              </section>
            );
          })}
        </div>
      )}

      <Drawer
        open={abertaId !== null}
        onClose={() => {
          setAbertaId(null);
        }}
        title="Negociação"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setAbertaId(null);
            }}
          >
            Fechar
          </Button>
        }
      >
        {aberta === null ? (
          <span style={{ fontSize: 13 }}>Carregando…</span>
        ) : (
          <Stack gap={4}>
            <Stack gap={1}>
              <Group gap={2}>
                <Badge tone={ETAPA_TOM[aberta.stage]}>{ETAPA_ROTULO[aberta.stage]}</Badge>
                {aberta.closedAt === null ? null : (
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    fechada em {formatDate(aberta.closedAt)}
                  </span>
                )}
              </Group>
              <span style={{ fontWeight: 600, fontSize: 18 }}>
                {imoveis.get(aberta.propertyId)?.title ?? 'Imóvel'}
              </span>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                {compradores.get(aberta.buyerPartyId)?.name ?? 'Comprador'}
              </span>
              {aberta.lostReason === null ? null : (
                <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                  Motivo: {aberta.lostReason}
                </span>
              )}
            </Stack>

            <HistoricoNegociacao
              negociacao={aberta}
              ocupado={ocupado}
              aoResponder={(eventoId, outcome) => {
                void executar(
                  `/sale-negotiations/${aberta.id}/events/${eventoId}/answer`,
                  { outcome },
                  'Resposta registrada',
                );
              }}
              aoPropor={(kind, amountCents) => {
                void executar(
                  `/sale-negotiations/${aberta.id}/events`,
                  { kind, amountCents },
                  'Proposta registrada',
                );
              }}
            />

            <DocumentacaoNegociacao negociacao={aberta} />

            <ComissaoNegociacao negociacao={aberta} />
          </Stack>
        )}
      </Drawer>
    </div>
  );
}

function HistoricoNegociacao({
  negociacao,
  ocupado,
  aoResponder,
  aoPropor,
}: {
  negociacao: NegociacaoDetalhe;
  ocupado: boolean;
  aoResponder: (eventoId: string, outcome: 'ACCEPTED' | 'REJECTED') => void;
  aoPropor: (kind: 'BUYER_OFFER' | 'SELLER_COUNTER', amountCents: number) => void;
}) {
  const [valor, setValor] = useState('');
  const encerrada = negociacao.stage === 'CLOSED' || negociacao.stage === 'LOST';
  const pendente = negociacao.events.find((evento) => evento.outcome === 'PENDING');

  return (
    <Stack gap={2}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>Histórico da negociação</span>
      {negociacao.events.map((evento) => (
        <Group
          key={evento.id}
          between
          wrap
          style={{
            padding: '10px 12px',
            border: '1px solid var(--peg-border)',
            borderRadius: 'var(--peg-radius-sm)',
          }}
        >
          <Stack gap={0}>
            <span style={{ fontSize: 13 }}>{TIPO_EVENTO_ROTULO[evento.kind] ?? evento.kind}</span>
            <span className="peg-text-tertiary" style={{ fontSize: 11 }}>
              {formatDate(evento.createdAt)}
              {evento.validUntil === null ? '' : ` · validade até ${formatDate(evento.validUntil)}`}
            </span>
          </Stack>
          <Group gap={2}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{formatBRL(evento.amountCents)}</span>
            <Badge tone={RESULTADO_EVENTO_TOM[evento.outcome] ?? 'neutral'}>
              {RESULTADO_EVENTO_ROTULO[evento.outcome] ?? evento.outcome}
            </Badge>
          </Group>
        </Group>
      ))}

      {encerrada ? (
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Negociação encerrada: o histórico fica como está.
        </span>
      ) : (
        <Stack gap={2}>
          {pendente === undefined ? null : (
            <Group gap={2}>
              <Button
                size="sm"
                variant="secondary"
                loading={ocupado}
                onClick={() => {
                  aoResponder(pendente.id, 'ACCEPTED');
                }}
              >
                Aceitar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={ocupado}
                onClick={() => {
                  aoResponder(pendente.id, 'REJECTED');
                }}
              >
                Recusar
              </Button>
            </Group>
          )}
          <Group gap={2} wrap className="sale-drawer__propor">
            <Input
              size="sm"
              inputMode="numeric"
              aria-label="Valor da nova proposta em reais"
              placeholder="Valor em R$"
              value={valor}
              onChange={(evento) => {
                setValor(evento.target.value);
              }}
            />
            <Button
              size="sm"
              variant="brand"
              loading={ocupado}
              onClick={() => {
                const reais = Number(valor.replace(/\D/g, ''));
                if (!Number.isFinite(reais) || reais <= 0) {
                  return;
                }
                aoPropor('SELLER_COUNTER', reais * 100);
                setValor('');
              }}
            >
              Nova contraproposta
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

function DocumentacaoNegociacao({ negociacao }: { negociacao: NegociacaoDetalhe }) {
  return (
    <Stack gap={2}>
      <Group between>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Documentação</span>
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          {negociacao.documents.provided} de {negociacao.documents.total}
        </span>
      </Group>
      {negociacao.documentList.length === 0 ? (
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Nenhum documento na lista ainda.
        </span>
      ) : (
        negociacao.documentList.map((documento) => (
          <Group key={documento.id} between>
            <Stack gap={0}>
              <span style={{ fontSize: 13 }}>{documento.label}</span>
              <span className="peg-text-tertiary" style={{ fontSize: 11 }}>
                {LADO_DOCUMENTO_ROTULO[documento.side] ?? documento.side}
              </span>
            </Stack>
            <Badge tone={documento.provided ? 'success' : 'neutral'}>
              {documento.provided ? 'entregue' : 'pendente'}
            </Badge>
          </Group>
        ))
      )}
    </Stack>
  );
}

function ComissaoNegociacao({ negociacao }: { negociacao: NegociacaoDetalhe }) {
  return (
    <Stack gap={2}>
      <Group between>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          Comissão prevista · {percentualLegivel(negociacao.commissionBps)}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {formatBRL(negociacao.commissionCents)}
        </span>
      </Group>
      {negociacao.commissionShares.length === 0 ? (
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Sem divisão definida: a comissão fica inteira para a imobiliária.
        </span>
      ) : (
        negociacao.commissionShares.map((parte) => (
          <Group key={parte.role} between>
            <span style={{ fontSize: 13 }}>
              {PAPEL_COMISSAO_ROTULO[parte.role] ?? parte.role} ·{' '}
              {percentualLegivel(parte.percentBps)}
            </span>
            <span style={{ fontSize: 13 }}>{formatBRL(parte.amountCents)}</span>
          </Group>
        ))
      )}
      <span className="peg-text-tertiary" style={{ fontSize: 11 }}>
        Calculada sobre {negociacao.closedAt === null ? 'o valor em jogo' : 'o valor que fechou'}.
      </span>
    </Stack>
  );
}

export function NegociacoesClient() {
  return (
    <ToastProvider>
      <NegociacoesBody />
    </ToastProvider>
  );
}
