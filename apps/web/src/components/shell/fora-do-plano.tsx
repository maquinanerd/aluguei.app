'use client';

import { createContext, useContext } from 'react';
import type { PlanModule } from '@aluguei/domain';

/**
 * Rede de segurança da tela de upgrade no lugar (tela 33, defeito 13): a moldura já mostra o
 * upgrade quando a rota é de um módulo fora do plano; se uma consulta da página ainda assim
 * receber o 403 `PLAN_MODULE_NOT_INCLUDED`, ela avisa aqui e a moldura troca o conteúdo pela tela
 * de upgrade daquele módulo, em vez do "sem permissão" genérico.
 */
export const AvisarForaDoPlanoContext = createContext<(modulo: PlanModule) => void>(() => {
  /* fora da moldura (testes, páginas públicas): nada a fazer */
});

export function useAvisarForaDoPlano(): (modulo: PlanModule) => void {
  return useContext(AvisarForaDoPlanoContext);
}
