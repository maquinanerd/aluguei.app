/** Validação de orçamento de campanha (centavos inteiros, limites por org, XOR). */

export interface OrgBudgetLimits {
  maxDailyBudgetCents: number;
  maxLifetimeBudgetCents: number;
}

export interface BudgetInput {
  dailyBudgetCents?: number | null;
  lifetimeBudgetCents?: number | null;
  limits: OrgBudgetLimits;
}

export interface BudgetResult {
  valid: boolean;
  errors: string[];
  /** Valor de orçamento efetivo em centavos (daily ou lifetime), se válido. */
  effectiveBudgetCents?: number;
  kind?: 'DAILY' | 'LIFETIME';
}

export function validateBudget(input: BudgetInput): BudgetResult {
  const errors: string[] = [];
  const hasDaily = input.dailyBudgetCents !== undefined && input.dailyBudgetCents !== null;
  const hasLifetime = input.lifetimeBudgetCents !== undefined && input.lifetimeBudgetCents !== null;

  if (hasDaily === hasLifetime) {
    errors.push('Defina exatamente um orçamento: daily OU lifetime (XOR)');
    return { valid: false, errors };
  }

  const value = hasDaily
    ? (input.dailyBudgetCents as number)
    : (input.lifetimeBudgetCents as number);
  if (!Number.isSafeInteger(value) || value < 0) {
    errors.push('Orçamento deve ser inteiro não-negativo em centavos');
    return { valid: false, errors };
  }

  if (hasDaily) {
    if (value > input.limits.maxDailyBudgetCents) {
      errors.push(
        `Orçamento diário excede o limite da organização (${String(input.limits.maxDailyBudgetCents)})`,
      );
    }
    return { valid: errors.length === 0, errors, effectiveBudgetCents: value, kind: 'DAILY' };
  }
  if (value > input.limits.maxLifetimeBudgetCents) {
    errors.push(
      `Orçamento total excede o limite da organização (${String(input.limits.maxLifetimeBudgetCents)})`,
    );
  }
  return { valid: errors.length === 0, errors, effectiveBudgetCents: value, kind: 'LIFETIME' };
}
