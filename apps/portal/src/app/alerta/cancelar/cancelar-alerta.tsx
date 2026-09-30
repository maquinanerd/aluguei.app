'use client';

import { useActionState } from 'react';
import { cancelarAlertaAction } from '@/app/actions';
import type { EstadoDoFormulario } from '@/app/actions';
import { Botao, BotaoLink } from '@/components/Botao';

const INICIAL: EstadoDoFormulario = { estado: 'inicial' };

/**
 * Pergunta antes de cancelar. O cancelamento sai do botão, por ação POST: abrir o link não muda
 * nada, então leitor de e-mail que pré-abre links não cancela alerta de ninguém.
 */
export function CancelarAlerta({ token }: { token: string }) {
  const [estado, acao, enviando] = useActionState(cancelarAlertaAction, INICIAL);

  if (estado.estado === 'enviado') {
    return (
      <section role="status">
        <h1 className="pagina__titulo">Alerta cancelado</h1>
        <p>
          Você não recebe mais aviso desta busca. Se mudar de ideia, dá para criar o alerta de novo
          na página da busca.
        </p>
      </section>
    );
  }

  return (
    <form action={acao}>
      <h1 className="pagina__titulo">Cancelar este alerta?</h1>
      <p>Você deixa de receber avisos desta busca. Seus outros alertas continuam.</p>
      <input type="hidden" name="token" value={token} />
      {estado.estado === 'erro' ? (
        <p className="form-contato__aviso" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      <div className="alerta-cancelar__acoes">
        <Botao type="submit" variante="escuro" altura={46} carregando={enviando}>
          {enviando ? 'Cancelando…' : 'Cancelar alerta'}
        </Botao>
        <BotaoLink variante="cinza" altura={46} href="/">
          Manter
        </BotaoLink>
      </div>
    </form>
  );
}
