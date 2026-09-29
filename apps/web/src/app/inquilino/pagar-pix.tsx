'use client';

import { useState } from 'react';
import { AvisoModoTeste, Button, Stack } from '@aluguei/ui';

/**
 * Pagamento por Pix da cobrança do inquilino (Onda 6).
 *
 * O aviso de modo de teste vem do provider em uso (`/portal/me`), não de texto
 * fixo: enquanto o Asaas não entrar, o cliente precisa saber **antes de tentar
 * pagar** que isto é simulação — senão ele considera a conta quitada e quem
 * cobra de novo é a imobiliária.
 *
 * O código Pix exibido é o emitido pelo provider. A tela nunca fabrica um: um
 * código inventado levaria alguém a pagar para o lugar errado.
 */
export function PagarPix({ chargeId, emTeste }: { chargeId: string; emTeste: boolean }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function gerar(): Promise<void> {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/portal/tenant/charges/${chargeId}/payment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const corpo: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(
          typeof corpo === 'object' && corpo !== null && 'message' in corpo
            ? String((corpo as { message: unknown }).message)
            : 'Não foi possível gerar o Pix agora.',
        );
        return;
      }
      const pix = (corpo as { pixQrCode?: string | null }).pixQrCode ?? null;
      if (pix === null || pix === '') {
        setErro('O provedor não devolveu um código Pix para esta cobrança.');
        return;
      }
      setCodigo(pix);
    } catch {
      setErro('Não foi possível gerar o Pix agora.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Stack gap={3}>
      {emTeste ? (
        <AvisoModoTeste provedor="Asaas">
          O pagamento real chega em breve. Por enquanto, pague pelo boleto enviado pela imobiliária
          — o código abaixo é uma simulação e não quita a cobrança.
        </AvisoModoTeste>
      ) : null}

      {codigo === null ? (
        <Button
          variant="primary"
          fullWidth
          loading={ocupado}
          onClick={() => {
            void gerar();
          }}
        >
          Pagar com Pix
        </Button>
      ) : (
        <Stack gap={2}>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            Pix copia e cola
          </span>
          <code
            style={{
              fontSize: 12,
              wordBreak: 'break-all',
              padding: '10px 12px',
              background: 'var(--peg-surface-subtle, var(--peg-canvas))',
              borderRadius: 'var(--peg-radius-sm)',
            }}
          >
            {codigo}
          </code>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              void navigator.clipboard.writeText(codigo).then(
                () => {
                  setCopiado(true);
                },
                () => {
                  setErro('Não foi possível copiar. Selecione o código acima.');
                },
              );
            }}
          >
            {copiado ? 'Código copiado' : 'Copiar código'}
          </Button>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            A confirmação aparece aqui depois que o pagamento for reconhecido.
          </span>
        </Stack>
      )}

      {erro === null ? null : (
        <span role="alert" style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
          {erro}
        </span>
      )}
    </Stack>
  );
}
