/**
 * Pedido de troca de plano feito pela imobiliária na tela de upgrade (rodada de fidelidade,
 * ADR-105, B15). O pedido não muda o plano: a equipe da plataforma troca o plano e o pedido vira
 * `DONE`, ou descarta o pedido (`DISMISSED`). No máximo um `PENDING` por imobiliária.
 */
export const PLAN_CHANGE_REQUEST_STATUSES = ['PENDING', 'DONE', 'DISMISSED'] as const;

export type PlanChangeRequestStatus = (typeof PLAN_CHANGE_REQUEST_STATUSES)[number];
