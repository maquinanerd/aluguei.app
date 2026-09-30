'use client';

import { useActionState } from 'react';
import { criarAlertaAction } from '@/app/actions';
import type { EstadoDoFormulario } from '@/app/actions';
import { POLITICA_DE_PRIVACIDADE } from '@/lib/legal';
import { Botao } from './Botao';
import { Campo } from './Campo';

/**
 * Formas do alerta nas telas (telas/portal/02-busca e 04-outras):
 * - `bloco` — bloco cinza da busca, ao lado do FAQ (botão de 50px);
 * - `caixa` — caixa com filete preto de 2px da busca com poucos anúncios e da busca vazia;
 * - `modal` — painel "Criar alerta" com o resumo da busca em chips (botão de 52px e o erro
 *   embaixo dele).
 */
export type FormaDoAlerta = 'bloco' | 'caixa' | 'modal';

export interface AlertaImovelProps {
  purpose: 'RENT' | 'SALE';
  city: string;
  neighborhood?: string | undefined;
  propertyType?: string | undefined;
  bedrooms?: number | undefined;
  forma?: FormaDoAlerta;
  /** "Alerta de imóvel", "Poucas opções agora"; nulo na busca vazia e no modal. */
  sobretitulo?: string | null;
  /** O recorte dito em frase ("Receba os novos apartamentos de 2 quartos no Setor Bueno."). */
  titulo: string;
  /** Resumo da busca em chips, só no modal. */
  chips?: readonly string[];
}

const INICIAL: EstadoDoFormulario = { estado: 'inicial' };

/** Texto do consentimento em cada forma, sem citar a política enquanto ela não existir. */
function Consentimento({ forma }: { forma: FormaDoAlerta }) {
  const politica =
    POLITICA_DE_PRIVACIDADE === null ? null : (
      <>
        {' '}
        e li a <a href={POLITICA_DE_PRIVACIDADE}>política de privacidade</a>
      </>
    );
  if (forma === 'modal') {
    return <>Aceito receber avisos de novos imóveis desta busca{politica}.</>;
  }
  if (forma === 'caixa') {
    return <>Aceito receber avisos{politica}.</>;
  }
  return <>Aceito receber avisos de imóveis{politica}. Posso cancelar quando quiser.</>;
}

/**
 * Alerta de imóvel. Criado, fica pendente: a pessoa confirma pelo link de uso único. Ninguém entra
 * numa lista de aviso sem confirmar (ADR-099). O aviso é só por e-mail (defeito 9), então o canal
 * E-mail/WhatsApp das telas não aparece.
 */
export function AlertaImovel({
  forma = 'bloco',
  sobretitulo = null,
  titulo,
  chips,
  ...recorte
}: AlertaImovelProps) {
  const [estado, acao, enviando] = useActionState(criarAlertaAction, INICIAL);
  const classe = `alerta alerta--${forma}`;

  if (estado.estado === 'enviado') {
    return (
      <section className={classe} role="status">
        <h3 className="alerta__titulo alerta__titulo--pronto">Falta confirmar seu e-mail</h3>
        <p className="alerta__texto">{estado.mensagem}</p>
      </section>
    );
  }

  const erroDoContato = estado.estado === 'erro' && estado.campo === 'contato';
  const erroGeral =
    (estado.estado === 'erro' && !erroDoContato) || estado.estado === 'limite'
      ? estado.mensagem
      : null;

  return (
    <form className={classe} action={acao}>
      {sobretitulo ? <span className="alerta__sobretitulo">{sobretitulo}</span> : null}
      <h3 className="alerta__titulo">{titulo}</h3>
      {chips && chips.length > 0 ? (
        <div className="alerta__chips">
          {chips.map((chip) => (
            <span key={chip} className="chip chip--etiqueta">
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <input type="hidden" name="purpose" value={recorte.purpose} />
      <input type="hidden" name="city" value={recorte.city} />
      {recorte.neighborhood === undefined ? null : (
        <input type="hidden" name="neighborhood" value={recorte.neighborhood} />
      )}
      {recorte.propertyType === undefined ? null : (
        <input type="hidden" name="propertyType" value={recorte.propertyType} />
      )}
      {recorte.bedrooms === undefined ? null : (
        <input type="hidden" name="bedrooms" value={String(recorte.bedrooms)} />
      )}
      {/* Só e-mail: não há envio por WhatsApp (Onda 0 da rodada de fidelidade, defeito 9). */}
      <input type="hidden" name="canal" value="EMAIL" />

      <Campo
        id={`alerta-contato-${forma}`}
        name="contato"
        rotulo="Seu e-mail"
        placeholder="seu@email.com"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        {...(erroDoContato ? { erro: estado.mensagem } : {})}
      />

      <div className="consentimento consentimento--alerta">
        <input
          type="checkbox"
          id={`alerta-consentimento-${forma}`}
          name="consentimento"
          className="consentimento__controle"
        />
        <span className="consentimento__caixa" aria-hidden="true" />
        <label htmlFor={`alerta-consentimento-${forma}`} className="consentimento__texto">
          <Consentimento forma={forma} />
        </label>
      </div>

      <Botao type="submit" altura={forma === 'modal' ? 52 : 50} larguraTotal carregando={enviando}>
        {enviando ? 'Criando…' : 'Criar alerta'}
      </Botao>

      {erroGeral ? (
        <p className="alerta__erro" role="alert">
          {erroGeral}
        </p>
      ) : null}
    </form>
  );
}
