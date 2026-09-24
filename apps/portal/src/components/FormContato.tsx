'use client';

import { useActionState } from 'react';
import { enviarContatoAction } from '@/app/actions';
import type { EstadoDoFormulario } from '@/app/actions';
import { Botao } from './Botao';
import { Campo, CheckboxLgpd } from './Campo';

export interface FormContatoProps {
  slug: string;
  /** Mensagem pré-preenchida, como na tela de referência. */
  mensagemInicial?: string;
}

const INICIAL: EstadoDoFormulario = { estado: 'inicial' };

/**
 * Contato do anúncio. Estados da tela de referência (complementos ·
 * contato-estados): erro de campo, enviando, enviado e falha/429.
 * O consentimento nunca nasce marcado.
 */
export function FormContato({ slug, mensagemInicial }: FormContatoProps) {
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoDoFormulario, dados: FormData) =>
      enviarContatoAction(slug, anterior, dados),
    INICIAL,
  );

  if (estado.estado === 'enviado') {
    return (
      <div className="form-contato form-contato--enviado" role="status">
        <strong>Contato enviado.</strong>
        <p>
          A imobiliária responsável por este anúncio recebeu seus dados e responde pelo contato que
          você deixou.
        </p>
      </div>
    );
  }

  return (
    <form className="form-contato" action={acao}>
      <h2 className="secao__titulo">Falar com a imobiliária</h2>

      {estado.estado === 'limite' ? (
        <p className="form-contato__aviso" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      {estado.estado === 'erro' && estado.campo === undefined ? (
        <p className="form-contato__aviso" role="alert">
          {estado.mensagem}
        </p>
      ) : null}

      <Campo
        id="contato-nome"
        name="nome"
        rotulo="Nome"
        autoComplete="name"
        required
        {...(estado.estado === 'erro' && estado.campo === 'nome' ? { erro: estado.mensagem } : {})}
      />
      <Campo
        id="contato-telefone"
        name="telefone"
        rotulo="Telefone (WhatsApp)"
        autoComplete="tel"
        inputMode="tel"
        {...(estado.estado === 'erro' && estado.campo === 'telefone'
          ? { erro: estado.mensagem }
          : {})}
      />
      <Campo id="contato-email" name="email" rotulo="E-mail" type="email" autoComplete="email" />
      <Campo
        id="contato-mensagem"
        name="mensagem"
        rotulo="Mensagem"
        multilinha
        defaultValue={mensagemInicial ?? 'Tenho interesse neste imóvel.'}
      />
      <CheckboxLgpd id="contato-consentimento" name="consentimento" />

      <Botao type="submit" grande carregando={enviando}>
        {enviando ? 'Enviando…' : 'Enviar contato'}
      </Botao>
    </form>
  );
}
