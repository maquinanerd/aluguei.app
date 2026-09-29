'use client';

import { useEffect, useState } from 'react';
import { Button, Input } from '@aluguei/ui';

/**
 * Pedido de link de acesso pelo próprio cliente (Onda 6).
 *
 * Duas coisas que a tela **não** faz, de propósito:
 *
 * 1. **Não diz se o contato existe.** A resposta é sempre a mesma — dizer
 *    "não encontramos" transformaria a tela num verificador de quem é cliente
 *    de quem.
 * 2. **Não promete entrega.** Nenhum canal de envio está ligado hoje
 *    (`docs/BLOCKERS.md`): a mensagem é registrada e a imobiliária a repassa.
 *    Escrever "enviamos um WhatsApp" seria afirmar o que não acontece — e quem
 *    ficaria esperando é justamente quem já é cliente.
 */

const ESPERA_SEGUNDOS = 45;

export function PedirLink({ aninhado = false }: { aninhado?: boolean } = {}) {
  // Dentro da tela de link vencido já existe um h1; um segundo quebraria a
  // hierarquia de títulos para quem navega por leitor de tela.
  const Titulo = aninhado ? 'h2' : 'h1';
  const [contato, setContato] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) {
      return;
    }
    const id = setTimeout(() => {
      setEspera((valor) => valor - 1);
    }, 1000);
    return () => {
      clearTimeout(id);
    };
  }, [espera]);

  async function pedir(): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/portal/auth/request-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact: contato }),
      });
      if (res.status === 429) {
        setErro('Muitos pedidos seguidos. Aguarde um minuto e tente de novo.');
        return;
      }
      if (!res.ok) {
        setErro('Não foi possível pedir o link agora. Tente de novo em instantes.');
        return;
      }
      setPedido(true);
      setEspera(ESPERA_SEGUNDOS);
    } catch {
      setErro('Não foi possível pedir o link agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  if (pedido) {
    return (
      <div className="peg-stack" style={{ gap: 12 }}>
        <Titulo style={{ fontSize: 20 }}>Pedido registrado</Titulo>
        <p style={{ fontSize: 14, color: 'var(--peg-text-secondary)' }} role="status">
          Se existir uma locação com este contato, a imobiliária envia o seu link de acesso. Ele
          vale por 15 minutos e só pode ser usado uma vez.
        </p>
        <Button
          variant="secondary"
          fullWidth
          disabled={espera > 0}
          loading={enviando}
          onClick={() => {
            void pedir();
          }}
        >
          {espera > 0 ? `Pedir de novo em ${String(espera)}s` : 'Pedir de novo'}
        </Button>
        <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
          Não recebeu? Fale com a imobiliária que administra a sua locação.
        </p>
      </div>
    );
  }

  return (
    <form
      className="peg-stack"
      style={{ gap: 16 }}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void pedir();
      }}
    >
      <Titulo style={{ fontSize: 20 }}>Acesse sua locação</Titulo>
      <p style={{ fontSize: 14, color: 'var(--peg-text-secondary)' }}>
        Informe o e-mail ou o celular cadastrado na imobiliária. O link vale por 15 minutos e só
        pode ser usado uma vez.
      </p>
      {erro === null ? null : (
        <p role="alert" style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
          {erro}
        </p>
      )}
      <Input
        id="portal-contato"
        label="E-mail ou celular"
        autoComplete="username"
        autoFocus
        placeholder="voce@email.com ou (62) 9 0000-0000"
        value={contato}
        onChange={(evento) => {
          setContato(evento.target.value);
        }}
      />
      <Button
        type="submit"
        variant="primary"
        fullWidth
        loading={enviando}
        disabled={contato.trim().length < 3}
      >
        Receber link de acesso
      </Button>
      <p style={{ fontSize: 13, color: 'var(--peg-text-tertiary)' }}>
        Você é da imobiliária?{' '}
        <a href="/login" style={{ fontWeight: 500 }}>
          Entre no AchouImóvel Gestão
        </a>
        .
      </p>
    </form>
  );
}
