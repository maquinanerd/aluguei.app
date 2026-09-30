'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface GavetaProps {
  aberta: boolean;
  titulo: string;
  aoFechar: () => void;
  /** Ação no canto direito do topo (ex.: "Limpar" na gaveta de filtros). */
  acaoDoTopo?: ReactNode;
  /** Barra fixa no rodapé (ex.: "Ver 48 imóveis"). */
  rodape?: ReactNode;
  children: ReactNode;
}

/**
 * Gaveta cheia do celular (menu e filtros), com o topo da gaveta de filtros das telas: "×" à
 * esquerda, título e a ação à direita. Fecha no Esc, prende o foco no conteúdo e devolve o foco
 * para quem abriu.
 */
export function Gaveta({ aberta, titulo, aoFechar, acaoDoTopo, rodape, children }: GavetaProps) {
  const painel = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aberta) {
      return;
    }
    focoAnterior.current = document.activeElement as HTMLElement | null;
    painel.current?.focus();

    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        aoFechar();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      focoAnterior.current?.focus();
    };
  }, [aberta, aoFechar]);

  if (!aberta) {
    return null;
  }

  return (
    <div
      className="gaveta"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      ref={painel}
      tabIndex={-1}
    >
      <div className="gaveta__topo">
        <button type="button" className="gaveta__fechar" onClick={aoFechar} aria-label="Fechar">
          ×
        </button>
        <span className="gaveta__titulo">{titulo}</span>
        {acaoDoTopo ?? <span />}
      </div>
      <div className="gaveta__corpo">{children}</div>
      {rodape ? <div className="gaveta__rodape">{rodape}</div> : null}
    </div>
  );
}
