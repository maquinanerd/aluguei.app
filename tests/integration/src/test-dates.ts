/**
 * Período de cobrança para testes que iniciam pagamento pelo backoffice.
 *
 * O vencimento padrão é o início do período + 10 dias, e o backoffice recalcula
 * multa (2%) e juros (1% ao dia) com o relógio REAL no ato da iniciação
 * (apps/api/src/finance/initiation.ts). Um mês fixo no calendário vira
 * bomba-relógio: `finance.test.ts` passou até o dia do vencimento (2026-09-11)
 * e quebrou três dias depois com R$ 50 de encargos. Um mês à frente nunca está
 * vencido, qualquer que seja o dia da execução.
 */
export function futurePeriod(monthsAhead = 1): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, 1))
    .toISOString()
    .slice(0, 10);
}
