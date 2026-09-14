import type { Visit } from './types';

/**
 * Router por estado (sem dependência): cada rota carrega os dados mínimos que
 * a tela precisa. O stack de navegação vive no App.tsx.
 */
export type Route =
  | { name: 'login' }
  | { name: 'agenda' }
  | { name: 'visit-detail'; visit: Visit }
  | { name: 'inspection'; inspectionId: string }
  | { name: 'inspection-review'; inspectionId: string };

export interface Navigation {
  /** Empilha a rota (histórico simples — "voltar" desempilha). */
  navigate: (route: Route) => void;
  /** Substitui o stack inteiro (ex.: login → agenda). */
  reset: (route: Route) => void;
  back: () => void;
  canGoBack: boolean;
}
