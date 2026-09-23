import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface Comum {
  id: string;
  rotulo: string;
  /** Mensagem de erro inline; presente, muda a borda e liga o aria-describedby. */
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
  erro: string | undefined;
  ajuda: string | undefined;
  children: ReactNode;
}

function Envolucro({ id, rotulo, erro, ajuda, children }: EnvolucroProps) {
  return (
    <div className={erro ? 'campo campo--erro' : 'campo'}>
      <label className="campo__rotulo" htmlFor={id}>
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

/** Campo do portal (rótulo acima, erro inline). `multilinha` vira textarea. */
export function Campo(props: CampoProps | CampoTextoLongoProps) {
  const { id, rotulo, erro, ajuda } = props;
  if (props.multilinha) {
    const { multilinha: _multilinha, ...rest } = props;
    return (
      <Envolucro id={id} rotulo={rotulo} erro={erro} ajuda={ajuda}>
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
  const { multilinha: _multilinha, ...rest } = props;
  return (
    <Envolucro id={id} rotulo={rotulo} erro={erro} ajuda={ajuda}>
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
  erro?: string;
  /** Texto do consentimento; o padrão é o da tela de referência. */
  children?: ReactNode;
}

/**
 * Consentimento LGPD do formulário de contato: obrigatório, nunca pré-marcado,
 * e com o erro no próprio campo (telas · contato-estados).
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
  return (
    <div className={erro ? 'consentimento consentimento--erro' : 'consentimento'}>
      <input
        type="checkbox"
        id={id}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
      />
      <label htmlFor={id}>
        {children ?? (
          <>
            Autorizo o AchouImóvel a enviar meus dados para a imobiliária responsável por este
            anúncio, para responder a este contato.
          </>
        )}
        {erro ? (
          <span className="campo__erro" id={`${id}-erro`} role="alert">
            {erro}
          </span>
        ) : null}
      </label>
    </div>
  );
}
