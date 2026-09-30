'use client';

import { useEffect, useState } from 'react';
import { saudacao } from '@/lib/visao-geral';

/**
 * "Bom dia, Rafael" pelo relógio de quem lê. O servidor manda a saudação do instante da resposta;
 * depois de montar, vale a hora do navegador em São Paulo (a mesma do relógio da barra do topo).
 */
export function Saudacao({ nome, inicial }: { nome: string; inicial: string }) {
  const [texto, setTexto] = useState(inicial);

  useEffect(() => {
    setTexto(saudacao(new Date()));
  }, []);

  return (
    <h1 className="dash-titulo">
      {texto}, {nome}
    </h1>
  );
}
