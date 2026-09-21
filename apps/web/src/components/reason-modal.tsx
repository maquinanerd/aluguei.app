'use client';

import { useId, useState } from 'react';
import { Button, Modal, Textarea } from '@aluguei/ui';

/**
 * Diálogo de motivo obrigatório (cancelar visita, recusar proposta — G3, trilha D, P2-02). O
 * domínio recusa a transição sem motivo; a tela pede antes de enviar.
 */
export function ReasonModal({
  title,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
  hint,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  hint?: string;
}) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="danger" type="submit" form={formId} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="peg-stack"
        style={{ gap: 12 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) {
            setError('Informe o motivo');
            return;
          }
          onConfirm(reason.trim());
        }}
      >
        {hint ? (
          <span className="peg-text-secondary" style={{ fontSize: 13 }}>
            {hint}
          </span>
        ) : null}
        <Textarea
          label="Motivo"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          {...(error ? { error } : {})}
        />
      </form>
    </Modal>
  );
}
