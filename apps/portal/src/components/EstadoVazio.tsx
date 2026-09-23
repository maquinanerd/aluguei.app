import type { ReactNode } from 'react';

export interface EstadoVazioProps {
  titulo: string;
  /** O que a pessoa pode fazer agora — nunca um beco sem saída. */
  children?: ReactNode;
  acao?: ReactNode;
}

/** Estado vazio do portal (busca sem resultado, vitrine sem anúncio). */
export function EstadoVazio({ titulo, children, acao }: EstadoVazioProps) {
  return (
    <div className="estado-vazio">
      <span className="estado-vazio__titulo">{titulo}</span>
      {children ? <p className="estado-vazio__texto">{children}</p> : null}
      {acao}
    </div>
  );
}
