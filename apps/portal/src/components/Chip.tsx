import type { ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  /** Quando existe, o chip ganha o "×" para tirar o filtro. */
  aoRemover?: () => void;
  /** Rótulo do botão de remover, para leitor de tela. */
  rotuloRemover?: string;
}

/**
 * Chip de filtro. Com `aoRemover` é o removível da busca (34px, "×"); sem ele é a etiqueta do
 * resumo do alerta (32px). Na busca por URL, o removível é link: ver `ChipsDeFiltro`.
 */
export function Chip({ children, aoRemover, rotuloRemover }: ChipProps) {
  if (!aoRemover) {
    return <span className="chip chip--etiqueta">{children}</span>;
  }
  return (
    <span className="chip chip--removivel">
      {children}
      <button
        type="button"
        className="chip__remover"
        onClick={aoRemover}
        aria-label={rotuloRemover ?? 'Tirar filtro'}
      >
        ×
      </button>
    </span>
  );
}
