'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface ItemAcordeao {
  pergunta: string;
  resposta: ReactNode;
}

export interface AcordeaoProps {
  itens: readonly ItemAcordeao[];
  /** Índice aberto no primeiro render; -1 (padrão) abre nenhum. */
  abertoInicial?: number;
}

/**
 * Acordeão do FAQ: um aberto por vez, como na tela de referência. O JSON-LD de
 * FAQPage é responsabilidade da página, e só sai com todos os dados (Onda 2B).
 */
export function Acordeao({ itens, abertoInicial = -1 }: AcordeaoProps) {
  const [aberto, setAberto] = useState(abertoInicial);
  const base = useId();

  return (
    <div className="acordeao">
      {itens.map((item, indice) => {
        const estaAberto = indice === aberto;
        const idGatilho = `${base}-g${String(indice)}`;
        const idResposta = `${base}-r${String(indice)}`;
        return (
          <div className="acordeao__item" key={item.pergunta}>
            <h3 style={{ margin: 0 }}>
              <button
                type="button"
                className="acordeao__gatilho"
                id={idGatilho}
                aria-expanded={estaAberto}
                aria-controls={idResposta}
                onClick={() => {
                  setAberto(estaAberto ? -1 : indice);
                }}
              >
                {item.pergunta}
                <span aria-hidden="true">{estaAberto ? '−' : '+'}</span>
              </button>
            </h3>
            <div
              className="acordeao__resposta"
              id={idResposta}
              role="region"
              aria-labelledby={idGatilho}
              hidden={!estaAberto}
            >
              {item.resposta}
            </div>
          </div>
        );
      })}
    </div>
  );
}
