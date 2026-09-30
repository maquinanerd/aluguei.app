import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface Comum {
  id: string;
  rotulo: string;
  /**
   * As telas não mostram rótulo acima do campo (o título do formulário faz esse papel e o texto de
   * exemplo fica dentro). O rótulo continua no HTML para leitor de tela; `rotuloVisivel` o mostra.
   */
  rotuloVisivel?: boolean;
  /** Mensagem de erro inline; presente, a borda fica vermelha de 2px e liga o aria-describedby. */
  erro?: string;
  ajuda?: string;
}

export type CampoProps = Comum &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
    multilinha?: false;
  };

export type CampoTextoLongoProps = Comum &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> & {
    multilinha: true;
  };

interface EnvolucroProps {
  id: string;
  rotulo: string;
  rotuloVisivel: boolean;
  erro: string | undefined;
  ajuda: string | undefined;
  children: ReactNode;
}

function Envolucro({ id, rotulo, rotuloVisivel, erro, ajuda, children }: EnvolucroProps) {
  return (
    <div className={erro ? 'campo campo--erro' : 'campo'}>
      <label className={rotuloVisivel ? 'campo__rotulo' : 'visualmente-oculto'} htmlFor={id}>
        {rotulo}
      </label>
      {children}
      {ajuda ? (
        <span className="campo__ajuda" id={`${id}-ajuda`}>
          {ajuda}
        </span>
      ) : null}
      {erro ? (
        <span className="campo__erro" id={`${id}-erro`} role="alert">
          {erro}
        </span>
      ) : null}
    </div>
  );
}

function descritoPor(id: string, erro?: string, ajuda?: string): string | undefined {
  const ids = [ajuda ? `${id}-ajuda` : null, erro ? `${id}-erro` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/** Campo do portal (48px, erro inline). `multilinha` vira textarea de 84px. */
export function Campo(props: CampoProps | CampoTextoLongoProps) {
  const { id, rotulo, erro, ajuda } = props;
  const rotuloVisivel = props.rotuloVisivel ?? false;
  if (props.multilinha) {
    const { multilinha: _multilinha, rotuloVisivel: _visivel, ...rest } = props;
    return (
      <Envolucro id={id} rotulo={rotulo} rotuloVisivel={rotuloVisivel} erro={erro} ajuda={ajuda}>
        <textarea
          {...rest}
          id={id}
          className="campo__controle"
          aria-invalid={erro ? true : undefined}
          aria-describedby={descritoPor(id, erro, ajuda)}
        />
      </Envolucro>
    );
  }
  const { multilinha: _multilinha, rotuloVisivel: _visivel, ...rest } = props;
  return (
    <Envolucro id={id} rotulo={rotulo} rotuloVisivel={rotuloVisivel} erro={erro} ajuda={ajuda}>
      <input
        {...rest}
        id={id}
        className="campo__controle"
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor(id, erro, ajuda)}
      />
    </Envolucro>
  );
}

export interface CheckboxLgpdProps {
  id: string;
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: InputHTMLAttributes<HTMLInputElement>['onChange'];
  /** Com erro, a caixa fica vermelha e a mensagem toma o lugar do texto, como na tela de estados. */
  erro?: string;
  /** Texto do consentimento; o padrão é o do formulário de contato. */
  children?: ReactNode;
}

/**
 * Consentimento LGPD: obrigatório, nunca pré-marcado. A caixa é desenhada (18px, borda de 1,5px)
 * sobre um checkbox de verdade, que continua recebendo o foco e o clique.
 */
export function CheckboxLgpd({
  id,
  name,
  checked,
  defaultChecked,
  onChange,
  erro,
  children,
}: CheckboxLgpdProps) {
  const texto = children ?? (
    <>
      Autorizo o AchouImóvel a enviar meus dados para a imobiliária responsável por este anúncio,
      para responder a este contato.
    </>
  );
  return (
    <div className={erro ? 'consentimento consentimento--erro' : 'consentimento'}>
      <input
        type="checkbox"
        id={id}
        name={name}
        className="consentimento__controle"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
      />
      <span className="consentimento__caixa" aria-hidden="true" />
      <label htmlFor={id} className="consentimento__texto">
        {erro ? <span className="visualmente-oculto">{texto}</span> : texto}
        {erro ? (
          <span className="consentimento__erro" id={`${id}-erro`} role="alert">
            {erro}
          </span>
        ) : null}
      </label>
    </div>
  );
}
