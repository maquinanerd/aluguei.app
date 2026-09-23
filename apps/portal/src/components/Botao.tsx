import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type VarianteBotao = 'acento' | 'contorno' | 'texto';

export interface BotaoProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variante?: VarianteBotao;
  /** Ocupa a largura toda com 52px de altura (busca, "Ver N imóveis"). */
  grande?: boolean;
  carregando?: boolean;
  children: ReactNode;
}

/**
 * Botão do portal. Alvo mínimo de 44px (`--tap-min`) porque o celular usa os
 * mesmos componentes. "Carregando" desabilita e anuncia com `aria-busy`.
 */
export function Botao({
  variante = 'acento',
  grande = false,
  carregando = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: BotaoProps) {
  const classes = ['botao', `botao--${variante}`, grande ? 'botao--grande' : null]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled ?? carregando}
      aria-busy={carregando || undefined}
    >
      {children}
    </button>
  );
}

export interface BotaoLinkProps {
  variante?: VarianteBotao;
  grande?: boolean;
  href: string;
  children: ReactNode;
}

/** Mesma aparência do botão para navegação (o card e os CTAs do portal são links). */
export function BotaoLink({ variante = 'acento', grande = false, href, children }: BotaoLinkProps) {
  const classes = ['botao', `botao--${variante}`, grande ? 'botao--grande' : null]
    .filter(Boolean)
    .join(' ');
  return (
    <a className={classes} href={href}>
      {children}
    </a>
  );
}
