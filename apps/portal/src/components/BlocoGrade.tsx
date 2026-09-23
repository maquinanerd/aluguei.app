import type { CSSProperties, ReactNode } from 'react';
import { TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';

export interface BlocoGradeProps {
  /** Cor do bloco: o acento da marca ou a cor de um tipo de imóvel. */
  cor?: 'acento' | TipoImovel;
  /** Tamanho da grade: `tile` no mosaico, `band` na faixa, `desktop` no rodapé. */
  grade?: 'tile' | 'band' | 'desktop' | 'mobile';
  children: ReactNode;
  className?: string;
}

const GRADE = {
  tile: 'var(--grid-size-tile)',
  band: 'var(--grid-size-band)',
  desktop: 'var(--grid-size-desktop)',
  mobile: 'var(--grid-size-mobile)',
};

/**
 * Bloco colorido com grade — a única textura do portal (regra 3 da entrega).
 * Sem gradiente e sem sombra pesada.
 */
export function BlocoGrade({
  cor = 'acento',
  grade = 'desktop',
  children,
  className,
}: BlocoGradeProps) {
  const estilo = {
    '--bloco-cor': cor === 'acento' ? 'var(--brand-accent)' : TIPO_IMOVEL[cor].cor,
    '--bloco-texto': cor === 'acento' ? 'var(--brand-on-accent)' : TIPO_IMOVEL[cor].corTexto,
    '--bloco-grade': GRADE[grade],
  } as CSSProperties;

  return (
    <div className={className ? `bloco-grade ${className}` : 'bloco-grade'} style={estilo}>
      {children}
    </div>
  );
}
