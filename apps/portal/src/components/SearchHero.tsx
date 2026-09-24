'use client';

import { useState } from 'react';
import { TIPOS_IMOVEL, TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';
import { Botao } from './Botao';

export interface SearchHeroProps {
  /** Cidade aproximada pelo IP, quando o proxy informa. Sem ela, campo vazio. */
  cidadePadrao?: { slug: string; nome: string } | null;
  /** Cidades com anúncio, para a pessoa escolher sem digitar errado. */
  cidades: { slug: string; nome: string }[];
}

/**
 * Busca da Home: abas Alugar/Comprar e os quatro campos da tela de referência.
 * Envia navegando para o caminho canônico (`/alugar/[cidade-uf]/[tipo]`), nunca
 * para uma URL com query — é o caminho que indexa (ADR-099).
 */
export function SearchHero({ cidadePadrao, cidades }: SearchHeroProps) {
  const [finalidade, setFinalidade] = useState<'alugar' | 'comprar'>('alugar');
  const [cidade, setCidade] = useState(cidadePadrao?.slug ?? cidades[0]?.slug ?? '');
  const [tipo, setTipo] = useState<TipoImovel | ''>('');

  const destino = cidade === '' ? null : `/${finalidade}/${cidade}${tipo === '' ? '' : `/${tipo}`}`;

  return (
    <div className="hero-busca">
      <div className="hero-busca__abas" role="tablist" aria-label="Finalidade">
        {(['alugar', 'comprar'] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            role="tab"
            aria-selected={finalidade === opcao}
            className="hero-busca__aba"
            onClick={() => {
              setFinalidade(opcao);
            }}
          >
            {opcao === 'alugar' ? 'Alugar' : 'Comprar'}
          </button>
        ))}
      </div>

      <div className="hero-busca__campos">
        <label className="hero-busca__campo">
          <span>Cidade</span>
          <select
            value={cidade}
            onChange={(evento) => {
              setCidade(evento.target.value);
            }}
          >
            {cidades.length === 0 ? <option value="">Nenhuma cidade ainda</option> : null}
            {cidades.map((opcao) => (
              <option key={opcao.slug} value={opcao.slug}>
                {opcao.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="hero-busca__campo">
          <span>Tipo</span>
          <select
            value={tipo}
            onChange={(evento) => {
              setTipo(evento.target.value as TipoImovel | '');
            }}
          >
            <option value="">Todos os tipos</option>
            {TIPOS_IMOVEL.map((opcao) => (
              <option key={opcao} value={opcao}>
                {TIPO_IMOVEL[opcao].nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="hero-busca__acao">
        {destino === null ? (
          <Botao grande disabled>
            Escolha uma cidade
          </Botao>
        ) : (
          <a className="botao botao--acento botao--grande" href={destino}>
            {finalidade === 'alugar' ? 'Buscar imóveis para alugar' : 'Buscar imóveis à venda'}
          </a>
        )}
      </div>
    </div>
  );
}
