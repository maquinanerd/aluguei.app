import { DomainError } from '../errors.js';

/**
 * Exclusividade de venda (Onda 5): o período em que a imobiliária tem
 * autorização do proprietário para vender o imóvel.
 *
 * Duas coisas que a tela promete e que moram aqui, não na interface:
 * 1. **Aviso antes do fim.** A imobiliária precisa renovar antes de perder a
 *    exclusividade, não descobrir depois — por isso o aviso é calculado do fim
 *    para trás, e não de uma data digitada à parte.
 * 2. **Sem exclusividade, o imóvel continua publicado.** Exclusividade é um
 *    acordo comercial, não um estado do anúncio: acabar não tira nada do ar.
 */

/** Dias de antecedência do aviso de fim, como na tela de referência. */
export const SALE_EXCLUSIVITY_WARNING_DAYS = 15;

/** Data em formato ISO de dia (`2026-12-22`), que é como o período é guardado. */
export type IsoDate = string;

const DIA_MS = 24 * 60 * 60 * 1000;

function paraUtc(data: IsoDate): number {
  const [ano, mes, dia] = data.split('-').map((parte) => Number(parte));
  if (ano === undefined || mes === undefined || dia === undefined || Number.isNaN(ano)) {
    throw new DomainError('INVALID_INPUT', `Data inválida: ${data}`);
  }
  return Date.UTC(ano, mes - 1, dia);
}

/** Dias inteiros entre duas datas, sem depender do fuso de quem pergunta. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((paraUtc(to) - paraUtc(from)) / DIA_MS);
}

export interface SaleExclusivityPeriod {
  startsOn: IsoDate;
  endsOn: IsoDate;
}

/**
 * Período válido: o fim vem depois do início. Um período de um dia é legítimo —
 * exclusividade curta existe —, mas fim antes do início é engano de digitação e
 * não pode virar registro.
 */
export function assertValidExclusivityPeriod(periodo: SaleExclusivityPeriod): void {
  if (daysBetween(periodo.startsOn, periodo.endsOn) <= 0) {
    throw new DomainError('INVALID_INPUT', 'O fim da exclusividade tem de ser depois do início');
  }
}

export type ExclusivityState = 'SCHEDULED' | 'ACTIVE' | 'ENDING_SOON' | 'EXPIRED' | 'CANCELED';

export interface ExclusivityStatus {
  state: ExclusivityState;
  /** Dias até o fim; negativo depois de vencida. */
  daysLeft: number;
  /** Duração total, para a tela dizer "91 dias". */
  totalDays: number;
}

/**
 * Situação da exclusividade em uma data. `ENDING_SOON` existe para a tela poder
 * avisar sem inventar a régua: são os 15 dias finais, contados do fim.
 */
export function exclusivityStatus(
  periodo: SaleExclusivityPeriod & { canceledAt?: string | null },
  today: IsoDate,
): ExclusivityStatus {
  const totalDays = daysBetween(periodo.startsOn, periodo.endsOn);
  const daysLeft = daysBetween(today, periodo.endsOn);
  if (periodo.canceledAt !== undefined && periodo.canceledAt !== null) {
    return { state: 'CANCELED', daysLeft, totalDays };
  }
  if (daysBetween(today, periodo.startsOn) > 0) {
    return { state: 'SCHEDULED', daysLeft, totalDays };
  }
  if (daysLeft < 0) {
    return { state: 'EXPIRED', daysLeft, totalDays };
  }
  return {
    state: daysLeft <= SALE_EXCLUSIVITY_WARNING_DAYS ? 'ENDING_SOON' : 'ACTIVE',
    daysLeft,
    totalDays,
  };
}

/** Vale hoje: agendada ainda não vale, vencida e cancelada não valem mais. */
export function isExclusivityInForce(status: ExclusivityStatus): boolean {
  return status.state === 'ACTIVE' || status.state === 'ENDING_SOON';
}

/**
 * Dois períodos do mesmo imóvel não podem se sobrepor: exclusividade é
 * autorização, e duas autorizações válidas ao mesmo tempo é contradição, não
 * renovação. Renovar é registrar um período que começa quando o outro acaba.
 */
export function periodsOverlap(a: SaleExclusivityPeriod, b: SaleExclusivityPeriod): boolean {
  return daysBetween(a.startsOn, b.endsOn) > 0 && daysBetween(b.startsOn, a.endsOn) > 0;
}
