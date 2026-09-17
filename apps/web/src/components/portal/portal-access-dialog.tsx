'use client';

import { useState } from 'react';
import { encode } from 'uqr';
import { Badge, Button, Input, Modal, Stack, useToast } from '@aluguei/ui';
import { formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { portalAccessState, portalEntryLink } from '@/lib/portal-access';
import type { PortalAccessSummary, PortalKind } from '@/lib/portal-access';

/** QR do link em SVG, módulo a módulo (sem HTML injetado). */
function QrCode({ text, label }: { text: string; label: string }) {
  const qr = encode(text, { ecc: 'M', border: 2 });
  const modules: Array<{ x: number; y: number }> = [];
  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) modules.push({ x, y });
    });
  });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(qr.size)} ${String(qr.size)}`}
      width={176}
      height={176}
      shapeRendering="crispEdges"
      style={{ background: '#fff', borderRadius: 'var(--peg-radius-sm)' }}
    >
      {modules.map((m) => (
        <rect key={`${String(m.x)}-${String(m.y)}`} x={m.x} y={m.y} width={1} height={1} />
      ))}
    </svg>
  );
}

const KIND_LABELS: Record<PortalKind, string> = {
  TENANT: 'portal do inquilino',
  LANDLORD: 'portal do proprietário',
};

/**
 * Concessão de acesso ao portal (auditoria 2026-09-10, P1-16): gera o link de uso único
 * com QR, mostra a situação do acesso e permite revogar. A entrega por e-mail ou
 * WhatsApp é da Fase 7 — aqui a imobiliária copia o link e envia.
 */
export function PortalAccessDialog({
  open,
  onClose,
  partyId,
  partyName,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  partyId: string;
  partyName: string;
  kind: PortalKind;
}) {
  const toast = useToast();
  const accesses = useQuery<{ accesses: PortalAccessSummary[] }>(
    open ? `/portal/access?partyId=${partyId}` : null,
    [partyId, open],
  );
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = (accesses.data?.accesses ?? []).find((a) => a.kind === kind) ?? null;
  const state = current ? portalAccessState(current) : null;

  function close() {
    setLink(null);
    onClose();
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await apiClient<{ oneTimeToken: string }>('/portal/access', {
        method: 'POST',
        body: { partyId, kind },
      });
      setLink(portalEntryLink(window.location.origin, res.oneTimeToken));
      accesses.reload();
    } catch (err) {
      toast.error('Não foi possível gerar o link', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(accessId: string) {
    setBusy(true);
    try {
      await apiClient(`/portal/access/${accessId}/revoke`, { method: 'POST' });
      setLink(null);
      accesses.reload();
    } catch (err) {
      toast.error('Não foi possível revogar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar', 'Selecione o link e copie manualmente.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Acesso ao portal"
      footer={
        <Button variant="tertiary" onClick={close}>
          Fechar
        </Button>
      }
    >
      <Stack gap={3}>
        <span>
          <strong>{partyName}</strong> · {KIND_LABELS[kind]}
        </span>
        {accesses.permissionDenied ? (
          <span role="alert" style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
            Seu perfil não pode gerenciar o acesso ao portal.
          </span>
        ) : accesses.error ? (
          <span role="alert" style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
            {accesses.error}
          </span>
        ) : state && current ? (
          <Stack gap={1}>
            <Badge tone={state.tone}>{state.label}</Badge>
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              Concedido em {formatDateTime(current.createdAt)} · sessões abertas:{' '}
              {String(current.activeSessions)}
            </span>
          </Stack>
        ) : (
          <span className="peg-text-tertiary">Nenhum acesso concedido ainda.</span>
        )}

        {link ? (
          <Stack gap={2}>
            <Input
              label="Link de acesso"
              value={link}
              readOnly
              onFocus={(e) => {
                e.currentTarget.select();
              }}
            />
            <QrCode text={link} label="QR code do link de acesso" />
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              O link vale por 7 dias e abre o portal uma única vez; gerar outro invalida este. Envie
              por um canal seguro.
            </span>
            <div>
              <Button variant="secondary" size="sm" onClick={() => void copy(link)}>
                Copiar link
              </Button>
            </div>
          </Stack>
        ) : null}

        <div className="peg-group" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="brand" size="sm" loading={busy} onClick={() => void generate()}>
            Gerar link de acesso
          </Button>
          {current && current.revokedAt === null ? (
            <Button
              variant="danger-subtle"
              size="sm"
              disabled={busy}
              onClick={() => void revoke(current.id)}
            >
              Revogar acesso
            </Button>
          ) : null}
        </div>
      </Stack>
    </Modal>
  );
}
