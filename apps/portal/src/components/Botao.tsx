import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Estilos dos botões das telas: `acento` (verde cheio), `contorno` (borda #111111), `escuro`
 * (#111111 cheio, "Cancelar alerta"), `cinza` (borda #D5D5D0, "Manter") e `texto` (ação verde
 * sem moldura, "Limpar tudo").
 */
export type VarianteBotao = 'acento' | 'contorno' | 'escuro' | 'cinza' | 'texto';

/** Alturas que as telas usam; o tamanho da letra acompanha (15 · 14,5 · 14px). */
export type AlturaBotao = 40 | 46 | 48 | 50 | 52;

interface Comum {
  variante?: VarianteBotao;
  altura?: AlturaBotao;
  /** Ocupa a largura toda (formulários, "Ver 48 imóveis"); sem ela, a largura é a do texto. */
  larguraTotal?: boolean;
  children: ReactNode;
}

export interface BotaoProps
  extends Comum, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** Enviando: verde escuro com o anel girando, desabilitado e anunciado por `aria-busy`. */
  carregando?: boolean;
}

interface Aparencia {
  variante?: VarianteBotao | undefined;
  altura?: AlturaBotao | undefined;
  larguraTotal?: boolean | undefined;
  carregando?: boolean | undefined;
}

function classesDe({
  variante = 'acento',
  altura = 48,
  larguraTotal = false,
  carregando = false,
}: Aparencia): string {
  return [
    'botao',
    `botao--${variante}`,
    variante === 'texto' ? null : `botao--${String(altura)}`,
    larguraTotal ? 'botao--total' : null,
    carregando ? 'botao--carregando' : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Botão do portal. Alvo mínimo de 44px (`--tap-min`) no celular; "carregando" desabilita e
 * anuncia com `aria-busy`.
 */
export function Botao({
  variante,
  altura,
  larguraTotal,
  carregando = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: BotaoProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classesDe({ variante, altura, larguraTotal, carregando })}
      disabled={disabled ?? carregando}
      aria-busy={carregando || undefined}
    >
      {carregando ? <span className="botao__anel" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export interface BotaoLinkProps extends Comum {
  href: string;
}

/** Mesma aparência do botão para navegação (os CTAs do portal são links). */
export function BotaoLink({ variante, altura, larguraTotal, href, children }: BotaoLinkProps) {
  return (
    <a className={classesDe({ variante, altura, larguraTotal })} href={href}>
      {children}
    </a>
  );
}
