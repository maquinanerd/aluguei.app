'use client';

import { useActionState } from 'react';
import { criarAlertaAction } from '@/app/actions';
import type { EstadoDoFormulario } from '@/app/actions';
import { Botao } from './Botao';
import { Campo, CheckboxLgpd } from './Campo';

export interface AlertaImovelProps {
  purpose: 'RENT' | 'SALE';
  city: string;
  neighborhood?: string | undefined;
  propertyType?: string | undefined;
  bedrooms?: number | undefined;
  /** Resumo do que a pessoa está buscando, para ela conferir antes de aceitar. */
  resumo: string;
}

const INICIAL: EstadoDoFormulario = { estado: 'inicial' };

/**
 * Alerta de imóvel. Criado, fica pendente: a pessoa confirma pelo link de uso
 * único. Ninguém entra numa lista de aviso sem confirmar (ADR-099).
 */
export function AlertaImovel(props: AlertaImovelProps) {
  const [estado, acao, enviando] = useActionState(criarAlertaAction, INICIAL);

  if (estado.estado === 'enviado') {
    return (
      <section className="alerta alerta--enviado" role="status">
        <strong>Quase lá.</strong>
        <p>{estado.mensagem}</p>
      </section>
    );
  }

  return (
    <form className="alerta" action={acao}>
      <h2 className="secao__titulo">Avise quando aparecer</h2>
      <p className="alerta__resumo">{props.resumo}</p>

      <input type="hidden" name="purpose" value={props.purpose} />
      <input type="hidden" name="city" value={props.city} />
      {props.neighborhood === undefined ? null : (
        <input type="hidden" name="neighborhood" value={props.neighborhood} />
      )}
      {props.propertyType === undefined ? null : (
        <input type="hidden" name="propertyType" value={props.propertyType} />
      )}
      {props.bedrooms === undefined ? null : (
        <input type="hidden" name="bedrooms" value={String(props.bedrooms)} />
      )}
      {/* Só e-mail: não há envio por WhatsApp (Onda 0 da rodada de fidelidade, defeito 9). */}
      <input type="hidden" name="canal" value="EMAIL" />

      <Campo
        id="alerta-contato"
        name="contato"
        rotulo="Seu e-mail"
        type="email"
        inputMode="email"
        required
        {...(estado.estado === 'erro' && estado.campo === 'contato'
          ? { erro: estado.mensagem }
          : {})}
      />

      <CheckboxLgpd id="alerta-consentimento" name="consentimento">
        Autorizo o AchouImóvel a me avisar por este contato quando aparecer imóvel nesta busca.
      </CheckboxLgpd>

      {estado.estado === 'erro' && estado.campo !== 'contato' ? (
        <p className="form-contato__aviso" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      {estado.estado === 'limite' ? (
        <p className="form-contato__aviso" role="alert">
          {estado.mensagem}
        </p>
      ) : null}

      <Botao type="submit" carregando={enviando}>
        {enviando ? 'Criando…' : 'Criar alerta'}
      </Botao>
    </form>
  );
}
