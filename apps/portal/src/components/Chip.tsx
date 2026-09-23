import type { ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  /** Quando existe, o chip ganha o "x" para tirar o filtro. */
  aoRemover?: () => void;
  /** Rótulo do botão de remover, para leitor de tela. */
  rotuloRemover?: string;
}

/** Chip de filtro aplicado (busca). Sem `aoRemover` é só etiqueta. */
export function Chip({ children, aoRemover, rotuloRemover }: ChipProps) {
  return (
    <span className="chip">
      {children}
      {aoRemover ? (
        <button
          type="button"
          className="chip__remover"
          onClick={aoRemover}
          aria-label={rotuloRemover ?? 'Tirar filtro'}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
