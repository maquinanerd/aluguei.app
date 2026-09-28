'use client';

import { Badge, Button, Group, Modal, Stack } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import { label, CHANNEL_TYPE_LABELS } from '@/lib/labels';

export interface Prontidao {
  canPublish: boolean;
  blockers: { code: string; label: string; action: string }[];
  channels: { channel: string; available: boolean; status: string | null }[];
}

export interface DialogoPublicacaoProps {
  listingId: string | null;
  titulo: string;
  ocupado: boolean;
  /** `pronto` é o portão de conteúdo; `publicar` é a ida ao ar nos canais. */
  etapa: 'pronto' | 'publicar';
  aoFechar: () => void;
  aoPublicar: () => void;
  /** Leva ao cadastro do imóvel para resolver um bloqueio. */
  aoResolver: (secao: string) => void;
}

/**
 * Diálogo de publicação (Onda 4): mostra em quais canais o anúncio vai sair, ou
 * o que falta para ele poder sair.
 *
 * Os bloqueios vêm de `GET /listings/:id/publish-readiness`, que usa a **mesma
 * função** do portão do servidor. Um diálogo com régua própria seria pior do
 * que nenhum: a pessoa resolveria o que a tela pediu e levaria o erro assim
 * mesmo.
 *
 * Canal sem adapter configurado aparece como indisponível em vez de sumir — a
 * imobiliária precisa saber que ele existe e ainda não está conectado.
 */
export function DialogoPublicacao({
  listingId,
  titulo,
  ocupado,
  etapa,
  aoFechar,
  aoPublicar,
  aoResolver,
}: DialogoPublicacaoProps) {
  const { data, loading } = useQuery<Prontidao>(
    listingId === null ? null : `/listings/${listingId}/publish-readiness`,
    [listingId],
  );

  const canais = data?.channels ?? [];
  const disponiveis = canais.filter((canal) => canal.available);
  const podePublicar = data?.canPublish === true;

  return (
    <Modal
      open={listingId !== null}
      onClose={aoFechar}
      title={
        !podePublicar && !loading
          ? 'Ainda não dá para publicar'
          : etapa === 'pronto'
            ? 'Marcar como pronto'
            : 'Publicar anúncio'
      }
      footer={
        <Group gap={2} style={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={aoFechar}>
            {podePublicar ? 'Cancelar' : 'Fechar'}
          </Button>
          <Button
            variant="brand"
            loading={ocupado}
            disabled={!podePublicar || loading}
            onClick={aoPublicar}
          >
            {etapa === 'pronto'
              ? 'Marcar como pronto'
              : disponiveis.length > 0 && podePublicar
                ? `Publicar em ${String(disponiveis.length)} ${disponiveis.length === 1 ? 'canal' : 'canais'}`
                : 'Publicar'}
          </Button>
        </Group>
      }
    >
      <Stack gap={3}>
        <span style={{ fontSize: 13 }} className="peg-text-secondary">
          {titulo}
        </span>

        {loading ? <span style={{ fontSize: 13 }}>Conferindo…</span> : null}

        {!loading && !podePublicar ? (
          <Stack gap={2}>
            {(data?.blockers ?? []).map((bloqueio) => (
              <Group
                key={bloqueio.code}
                between
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--peg-border)',
                  borderRadius: 'var(--peg-radius-sm)',
                }}
              >
                <span style={{ fontSize: 13 }}>{bloqueio.label}</span>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    aoResolver(bloqueio.action);
                  }}
                >
                  Resolver
                </Button>
              </Group>
            ))}
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              Nada foi publicado. O anúncio continua como está.
            </span>
          </Stack>
        ) : null}

        {!loading && podePublicar ? (
          <Stack gap={2}>
            {canais.map((canal) => (
              <Group key={canal.channel} between>
                <span style={{ fontSize: 13 }}>{label(CHANNEL_TYPE_LABELS, canal.channel)}</span>
                {canal.available ? (
                  <Badge tone={canal.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {canal.status === 'PUBLISHED' ? 'já publicado' : 'vai publicar'}
                  </Badge>
                ) : (
                  <Badge tone="neutral">não conectado</Badge>
                )}
              </Group>
            ))}
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              A publicação só acontece quando você confirmar. Preço, fotos e descrição ficam iguais
              em todos os canais conectados.
            </span>
          </Stack>
        ) : null}
      </Stack>
    </Modal>
  );
}
