'use client';

import { Badge, Button, Group, Modal, Stack } from '@aluguei/ui';
import { useQuery } from '@/lib/use-query';
import {
  label,
  CHANNEL_STATUS_LABELS,
  CHANNEL_STATUS_TONES,
  CHANNEL_TYPE_LABELS,
} from '@/lib/labels';

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
 * Diálogo de publicação (Onda 4): mostra que confirmar põe o anúncio no
 * AchouImóvel e em que situação estão os outros canais, ou o que falta para ele
 * poder sair.
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
            {etapa === 'pronto' ? 'Marcar como pronto' : 'Publicar no AchouImóvel'}
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
            {/* Confirmar põe o anúncio no ar, e "no ar" é o portal AchouImóvel. Os demais canais
                são publicados um a um, na tela de Canais (Onda 0 da rodada de fidelidade,
                defeito 10). */}
            <Group between>
              <span style={{ fontSize: 13 }}>AchouImóvel</span>
              <Badge tone="brand">vai publicar</Badge>
            </Group>
            {canais.map((canal) => (
              <Group key={canal.channel} between>
                <span style={{ fontSize: 13 }}>{label(CHANNEL_TYPE_LABELS, canal.channel)}</span>
                {!canal.available ? (
                  <Badge tone="neutral">não conectado</Badge>
                ) : canal.status === 'PUBLISHED' ? (
                  <Badge tone="success">já publicado</Badge>
                ) : canal.status !== null ? (
                  // Feed do Grupo OLX (ADR-107): o estado diz se entrou no arquivo ou foi importado.
                  <Badge tone={CHANNEL_STATUS_TONES[canal.status] ?? 'neutral'}>
                    {label(CHANNEL_STATUS_LABELS, canal.status)}
                  </Badge>
                ) : (
                  <Badge tone="neutral">pela tela de Canais</Badge>
                )}
              </Group>
            ))}
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              A publicação só acontece quando você confirmar. Nos outros canais, você publica pela
              tela de Canais.
            </span>
          </Stack>
        ) : null}
      </Stack>
    </Modal>
  );
}
