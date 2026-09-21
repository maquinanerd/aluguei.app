/**
 * Encargos, renovação, reajuste e encerramento da locação na interface (auditoria 2026-09-10,
 * P1-07 e P1-20). Espelha packages/domain/src/finance (chargeCalc.ts e leaseLifecycle.ts) sem
 * importar o pacote de domínio no bundle do cliente; lease-rules.test.ts compara com o domínio.
 * Datas são strings `AAAA-MM-DD`; mês de formulário é `AAAA-MM`.
 */

/** Teto da multa por atraso: 10% (domínio: MAX_LATE_FEE_BPS). */
export const LATE_FEE_MAX_BPS = 1_000;
/** Teto dos juros de mora: 1% ao mês (domínio: MAX_INTEREST_MONTHLY_BPS). */
export const INTEREST_MONTHLY_MAX_BPS = 100;
export const DUE_DAY_MAX = 28;

export const LEASE_INDEX_OPTIONS = [
  { value: 'IGPM', label: 'IGP-M' },
  { value: 'IPCA', label: 'IPCA' },
  { value: 'INPC', label: 'INPC' },
  { value: 'IVAR', label: 'IVAR' },
  { value: 'OUTRO', label: 'Outro índice' },
] as const;

const INDEX_LABELS: Record<string, string> = Object.fromEntries(
  LEASE_INDEX_OPTIONS.map((option) => [option.value, option.label]),
);

export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type Parsed<T, K extends string> =
  { ok: true; value: T } | { ok: false; errors: FieldErrors<K> };

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const PERCENT = /^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/;

function isCivilDate(value: string): boolean {
  const match = CIVIL_DATE.exec(value);
  if (!match) return false;
  const [, year = '', month = '', day = ''] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 8)}01`;
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function nextMonthStart(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return month === 12
    ? `${String(year + 1)}-01-01`
    : `${String(year)}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Percentual digitado (vírgula ou ponto, até duas casas, sinal opcional) em basis points. */
export function parsePercentBps(text: string): number | null {
  const match = PERCENT.exec(text.trim().replace(/\s*%$/, ''));
  if (!match) return null;
  const [, sign = '', integer = '', decimals = ''] = match;
  const bps = Number(integer) * 100 + Number(decimals.padEnd(2, '0'));
  return sign === '-' ? -bps : bps;
}

/** Basis points como percentual pt-BR, sem zeros à direita: 250 → "2,5%". */
export function formatBps(bps: number): string {
  const sign = bps < 0 ? '-' : '';
  const abs = Math.abs(bps);
  const integer = Math.floor(abs / 100);
  const decimals = String(abs % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${sign}${String(integer)}${decimals ? `,${decimals}` : ''}%`;
}

/** Percentual com sinal explícito quando positivo: "+4,52%". */
function formatSignedBps(bps: number): string {
  return bps > 0 ? `+${formatBps(bps)}` : formatBps(bps);
}

export interface LeaseTerms {
  lateFeeBps: number;
  interestMonthlyBps: number;
  dueDay: number;
}

export function parseLeaseTerms(input: {
  lateFee: string;
  interest: string;
  dueDay: string;
}): Parsed<LeaseTerms, 'lateFee' | 'interest' | 'dueDay'> {
  const errors: FieldErrors<'lateFee' | 'interest' | 'dueDay'> = {};
  const lateFeeBps = parsePercentBps(input.lateFee);
  if (lateFeeBps === null || lateFeeBps < 0 || lateFeeBps > LATE_FEE_MAX_BPS) {
    errors.lateFee = 'A multa fica entre 0% e 10%.';
  }
  const interestMonthlyBps = parsePercentBps(input.interest);
  if (
    interestMonthlyBps === null ||
    interestMonthlyBps < 0 ||
    interestMonthlyBps > INTEREST_MONTHLY_MAX_BPS
  ) {
    errors.interest = 'Os juros de mora ficam entre 0% e 1% ao mês.';
  }
  const dueDayText = input.dueDay.trim();
  const dueDay = /^\d{1,2}$/.test(dueDayText) ? Number(dueDayText) : NaN;
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > DUE_DAY_MAX) {
    errors.dueDay = 'O vencimento fica entre os dias 1 e 28.';
  }
  if (Object.keys(errors).length > 0 || lateFeeBps === null || interestMonthlyBps === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { lateFeeBps, interestMonthlyBps, dueDay } };
}

export interface LeaseActions {
  editTerms: boolean;
  renew: boolean;
  readjust: boolean;
  end: boolean;
}

const IN_FORCE = ['ACTIVE', 'DELINQUENT', 'TERMINATING'];

/**
 * O que a locação oferece em cada status. Renovar: só ativa ou inadimplente (domínio:
 * assertRenewal). Reajustar: em vigor (API: recusa PENDING e ENDED). Encerrar: toda transição para
 * TERMINATING, e também mudar a data de quem já está em encerramento (domínio: planLeaseEnd).
 */
export function leaseActions(status: string): LeaseActions {
  return {
    editTerms: status === 'PENDING' || IN_FORCE.includes(status),
    renew: status === 'ACTIVE' || status === 'DELINQUENT',
    readjust: IN_FORCE.includes(status),
    end: status === 'PENDING' || IN_FORCE.includes(status),
  };
}

/** Aluguel reajustado por índice, meio centavo para cima (domínio: readjustedRent). */
export function readjustedRentPreview(rentCents: number, adjustmentBps: number): number | null {
  if (!Number.isInteger(adjustmentBps) || adjustmentBps <= -10_000 || adjustmentBps > 10_000) {
    return null;
  }
  const scaled = BigInt(rentCents) * BigInt(10_000 + adjustmentBps);
  return Number((scaled + 5_000n) / 10_000n);
}

export interface RentChange {
  effectiveFrom: string;
  previousRentCents: number;
  newRentCents: number;
}

/** Aluguel do período pelo histórico de mudanças (domínio: rentForPeriod). */
export function rentForPeriodPreview(
  currentRentCents: number,
  changes: readonly RentChange[],
  periodStart: string,
): number {
  if (changes.length === 0) return currentRentCents;
  const sorted = [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const period = monthStartOf(periodStart);
  let rent = sorted[0]?.previousRentCents ?? currentRentCents;
  for (const change of sorted) {
    if (change.effectiveFrom <= period) {
      rent = change.newRentCents;
    }
  }
  return rent;
}

/**
 * Mudanças de aluguel do histórico (renovação com aluguel novo e reajuste), em ordem de registro.
 * Recebe o histórico como a API devolve, do mais recente ao mais antigo: no mesmo mês vale a mudança
 * registrada por último.
 */
export function rentChangesOf(amendmentsNewestFirst: readonly AmendmentLike[]): RentChange[] {
  return [...amendmentsNewestFirst].reverse().flatMap((amendment) =>
    amendment.effectiveFrom !== null &&
    amendment.previousRentCents !== null &&
    amendment.newRentCents !== null
      ? [
          {
            effectiveFrom: amendment.effectiveFrom,
            previousRentCents: amendment.previousRentCents,
            newRentCents: amendment.newRentCents,
          },
        ]
      : [],
  );
}

export interface ReadjustmentBody {
  effectiveFrom: string;
  indexName: string;
  adjustmentBps?: number;
  newMonthlyRentCents?: number;
}

export function parseReadjustment(input: {
  startDate: string;
  endDate: string | null;
  month: string;
  indexName: string;
  mode: 'PERCENT' | 'AMOUNT';
  percent: string;
  newRentCents: number | null;
}): Parsed<ReadjustmentBody, 'month' | 'indexName' | 'percent' | 'newRent'> {
  const errors: FieldErrors<'month' | 'indexName' | 'percent' | 'newRent'> = {};
  const month = MONTH.exec(input.month.trim());
  const effectiveFrom = month ? `${input.month.trim()}-01` : null;
  if (effectiveFrom === null || !isCivilDate(effectiveFrom)) {
    errors.month = 'Escolha o mês em que o novo aluguel começa.';
  } else if (effectiveFrom < monthStartOf(input.startDate)) {
    errors.month = 'O reajuste não pode começar antes do início da locação.';
  } else if (input.endDate !== null && effectiveFrom > monthStartOf(input.endDate)) {
    errors.month = 'O reajuste não pode começar depois do término da locação.';
  }
  if (!LEASE_INDEX_OPTIONS.some((option) => option.value === input.indexName)) {
    errors.indexName = 'Escolha o índice do reajuste.';
  }
  let adjustmentBps: number | null = null;
  if (input.mode === 'PERCENT') {
    adjustmentBps = parsePercentBps(input.percent);
    if (adjustmentBps === null || readjustedRentPreview(0, adjustmentBps) === null) {
      errors.percent = 'Informe o índice entre -99,99% e 100%, como 4,52.';
    }
  } else if (input.newRentCents === null || input.newRentCents <= 0) {
    errors.newRent = 'Informe o novo aluguel.';
  }
  if (Object.keys(errors).length > 0 || effectiveFrom === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value:
      input.mode === 'PERCENT' && adjustmentBps !== null
        ? { effectiveFrom, indexName: input.indexName, adjustmentBps }
        : {
            effectiveFrom,
            indexName: input.indexName,
            newMonthlyRentCents: input.newRentCents ?? 0,
          },
  };
}

export interface RenewalBody {
  endDate: string;
  monthlyRentCents?: number;
}

export function parseRenewal(input: {
  startDate: string;
  currentEndDate: string | null;
  endDate: string;
  newRentCents: number | null;
}): Parsed<RenewalBody, 'endDate' | 'newRent'> {
  const errors: FieldErrors<'endDate' | 'newRent'> = {};
  const endDate = input.endDate.trim();
  if (!isCivilDate(endDate)) {
    errors.endDate = 'Informe a nova data de término.';
  } else if (endDate <= (input.currentEndDate ?? input.startDate)) {
    errors.endDate = 'A nova data de término precisa ser depois do término atual.';
  }
  if (input.newRentCents !== null && input.newRentCents <= 0) {
    errors.newRent = 'O novo aluguel precisa ser maior que zero.';
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value:
      input.newRentCents !== null ? { endDate, monthlyRentCents: input.newRentCents } : { endDate },
  };
}

/** Mês em que o aluguel da renovação começa (API: mês do dia seguinte ao término, ou mês que vem). */
export function renewalRentStartsAt(currentEndDate: string | null, today: string): string {
  return currentEndDate ? monthStartOf(addDays(currentEndDate, 1)) : nextMonthStart(today);
}

export interface LeaseEndBody {
  endDate: string;
  reason: string;
}

export function parseLeaseEnd(input: {
  startDate: string;
  endDate: string;
  reason: string;
}): Parsed<LeaseEndBody, 'endDate' | 'reason'> {
  const errors: FieldErrors<'endDate' | 'reason'> = {};
  const endDate = input.endDate.trim();
  if (!isCivilDate(endDate)) {
    errors.endDate = 'Informe a data de término.';
  } else if (endDate < input.startDate) {
    errors.endDate = 'O término não pode ser antes do início da locação.';
  }
  const reason = input.reason.trim();
  if (reason.length < 3) {
    errors.reason = 'Descreva o motivo em pelo menos 3 caracteres.';
  } else if (reason.length > 500) {
    errors.reason = 'O motivo tem no máximo 500 caracteres.';
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { endDate, reason } };
}

/** Término já passado encerra na hora; senão, a locação fica em encerramento (domínio: planLeaseEnd). */
export function endOutcome(endDate: string, today: string): 'ENDED' | 'TERMINATING' {
  return endDate < today ? 'ENDED' : 'TERMINATING';
}

const UNPAID = ['SCHEDULED', 'OPEN', 'OVERDUE'];

/** Cobranças ainda devidas de meses depois do mês do término (a API cancela só as sem pagamento). */
export function unpaidChargesAfterEnd<T extends { periodStart: string; status: string }>(
  charges: readonly T[],
  endDate: string | null,
): T[] {
  if (endDate === null) return [];
  const endMonth = monthStartOf(endDate);
  return charges.filter(
    (charge) => UNPAID.includes(charge.status) && charge.periodStart > endMonth,
  );
}

export interface AmendmentLike {
  kind: string;
  effectiveFrom: string | null;
  previousEndDate: string | null;
  newEndDate: string | null;
  previousRentCents: number | null;
  newRentCents: number | null;
  indexName: string | null;
  adjustmentBps: number | null;
  reason: string | null;
}

export interface AmendmentFormatters {
  money: (cents: number) => string;
  date: (isoDate: string) => string;
}

const AMENDMENT_TITLES: Record<string, string> = {
  RENEWAL: 'Renovação',
  READJUSTMENT: 'Reajuste',
  TERMINATION: 'Encerramento',
};

function monthLabel(isoDate: string): string {
  return `${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

/** Linha do histórico da locação: renovação, reajuste ou encerramento. */
export function describeAmendment(
  amendment: AmendmentLike,
  fmt: AmendmentFormatters,
): { title: string; lines: string[] } {
  const lines: string[] = [];
  const rentLine = (): void => {
    if (
      amendment.previousRentCents !== null &&
      amendment.newRentCents !== null &&
      amendment.effectiveFrom !== null
    ) {
      lines.push(
        `Aluguel: ${fmt.money(amendment.previousRentCents)} → ${fmt.money(amendment.newRentCents)} a partir de ${monthLabel(amendment.effectiveFrom)}`,
      );
    }
  };
  if (amendment.kind === 'RENEWAL') {
    lines.push(
      `Término: ${amendment.previousEndDate ? fmt.date(amendment.previousEndDate) : 'sem data'} → ${amendment.newEndDate ? fmt.date(amendment.newEndDate) : 'sem data'}`,
    );
    rentLine();
  } else if (amendment.kind === 'READJUSTMENT') {
    rentLine();
    const index = amendment.indexName
      ? (INDEX_LABELS[amendment.indexName] ?? amendment.indexName)
      : 'Índice';
    lines.push(
      `Índice: ${index} (${amendment.adjustmentBps !== null ? formatSignedBps(amendment.adjustmentBps) : 'valor informado'})`,
    );
  } else if (amendment.kind === 'TERMINATION') {
    if (amendment.newEndDate) {
      lines.push(`Término: ${fmt.date(amendment.newEndDate)}`);
    }
    if (amendment.reason) {
      lines.push(`Motivo: ${amendment.reason}`);
    }
  }
  return { title: AMENDMENT_TITLES[amendment.kind] ?? amendment.kind, lines };
}

const saoPaulo = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoje em São Paulo, `AAAA-MM-DD` (domínio: saoPauloDate). */
export function saoPauloToday(now: Date = new Date()): string {
  return saoPaulo.format(now);
}
