import type { CSSProperties, ReactNode } from 'react';
import { TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';

export interface BlocoGradeProps {
  /** Cor do bloco: o acento da marca ou a cor de um tipo de imóvel. */
  cor?: 'acento' | TipoImovel;
  /**
   * Tamanho da grade, como nas telas: `tile` (34px) no mosaico e na identidade, `band` (56px) na
   * faixa da busca, `desktop` (48px) no hero, `mobile` (40px) na faixa do celular e `rodape`
   * (32px) no bloco da marca do rodapé.
   */
  grade?: 'tile' | 'band' | 'desktop' | 'mobile' | 'rodape';
  /** Filete da grade: 14% nas faixas e no rodapé, 16% (`forte`) no mosaico e nos blocos de tipo. */
  linha?: 'normal' | 'forte';
  children: ReactNode;
  className?: string;
}

const GRADE = {
  tile: 'var(--grid-size-tile)',
  band: 'var(--grid-size-band)',
  desktop: 'var(--grid-size-desktop)',
  mobile: 'var(--grid-size-mobile)',
  rodape: 'var(--grid-size-footer)',
};

/**
 * Bloco colorido com grade — a única textura do portal (regra 3 da entrega).
 * Sem gradiente e sem sombra pesada.
 */
export function BlocoGrade({
  cor = 'acento',
  grade = 'desktop',
  linha = 'normal',
  children,
  className,
}: BlocoGradeProps) {
  const estilo = {
    '--bloco-cor': cor === 'acento' ? 'var(--brand-accent)' : TIPO_IMOVEL[cor].cor,
    '--bloco-texto': cor === 'acento' ? 'var(--brand-on-accent)' : TIPO_IMOVEL[cor].corTexto,
    '--bloco-grade': GRADE[grade],
    '--bloco-linha': linha === 'forte' ? 'var(--grid-line-strong)' : 'var(--grid-line)',
  } as CSSProperties;

  return (
    <div className={className ? `bloco-grade ${className}` : 'bloco-grade'} style={estilo}>
      {children}
    </div>
  );
}
