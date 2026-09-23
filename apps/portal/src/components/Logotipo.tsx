import type { CSSProperties } from 'react';
import { TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';

/**
 * Logotipo do portal: "Achou" sempre em #111111 e "Imóvel" na cor da seção —
 * acento na Home e nas páginas gerais, a cor do tipo nas páginas de cada tipo,
 * tudo branco sobre bloco colorido (entrega de design, regra 6).
 */
export type CorLogotipo = 'acento' | 'branco' | TipoImovel;

export interface LogotipoProps {
  /** Cor da palavra "Imóvel". */
  cor?: CorLogotipo;
  tamanho?: 'sm' | 'md' | 'lg';
  /** Vira link quando recebe href; sem href é só texto (ex.: dentro do rodapé). */
  href?: string;
}

function corDe(cor: CorLogotipo): CSSProperties {
  if (cor === 'branco') {
    return {
      color: 'var(--brand-on-accent)',
      '--logo-imovel-color': 'var(--brand-on-accent)',
    } as CSSProperties;
  }
  if (cor === 'acento') {
    return { '--logo-imovel-color': 'var(--brand-accent)' } as CSSProperties;
  }
  return { '--logo-imovel-color': TIPO_IMOVEL[cor].cor } as CSSProperties;
}

export function Logotipo({ cor = 'acento', tamanho = 'md', href }: LogotipoProps) {
  const conteudo = (
    <>
      Achou<span className="logo__imovel">Imóvel</span>
    </>
  );
  const className = `logo logo--${tamanho}`;
  const style = corDe(cor);

  if (href) {
    return (
      <a className={className} style={style} href={href} aria-label="AchouImóvel, página inicial">
        {conteudo}
      </a>
    );
  }
  return (
    <span className={className} style={style}>
      {conteudo}
    </span>
  );
}
