import type { ReactNode } from 'react';

export interface Sugestao {
  rotulo: string;
  href: string;
}

export interface EstadoVazioProps {
  titulo: string;
  /** O que a pessoa pode fazer agora — nunca um beco sem saída. */
  children?: ReactNode;
  /** Outras buscas para seguir (chips de 40px, como na busca vazia). */
  sugestoes?: readonly Sugestao[];
  acao?: ReactNode;
}

/** Estado vazio do portal (busca sem resultado, vitrine sem anúncio), como na busca vazia. */
export function EstadoVazio({ titulo, children, sugestoes, acao }: EstadoVazioProps) {
  return (
    <div className="estado-vazio">
      <div className="estado-vazio__mensagem">
        <span className="estado-vazio__titulo">{titulo}</span>
        {children ? <p className="estado-vazio__texto">{children}</p> : null}
      </div>
      {sugestoes && sugestoes.length > 0 ? (
        <div className="estado-vazio__sugestoes">
          {sugestoes.map((sugestao) => (
            <a key={sugestao.href} className="chip chip--sugestao" href={sugestao.href}>
              {sugestao.rotulo}
            </a>
          ))}
        </div>
      ) : null}
      {acao}
    </div>
  );
}
