/**
 * Calendário bancário nacional e datas no fuso de São Paulo (auditoria 2026-09-10, P1-07).
 *
 * Datas são strings `YYYY-MM-DD` (data civil, sem hora). Feriados bancários nacionais da Febraban:
 * Confraternização Universal, Carnaval (segunda e terça), Sexta-feira Santa, Tiradentes, Dia do
 * Trabalho, Corpus Christi, Independência, Nossa Senhora Aparecida, Finados, Proclamação da
 * República, Consciência Negra (nacional a partir de 2024, Lei 14.759/2023) e Natal. Feriados
 * estaduais e municipais ficam fora.
 */

const DAY_MS = 86_400_000;

function toUtcMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return fromUtcMs(toUtcMs(isoDate) + days * DAY_MS);
}

/** Dias de calendário de `from` até `to` (negativo quando `to` vem antes). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const FIXED_HOLIDAYS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];

const holidayCache = new Map<number, ReadonlySet<string>>();

function holidaysOf(year: number): ReadonlySet<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const dates = new Set(FIXED_HOLIDAYS.map((monthDay) => `${String(year)}-${monthDay}`));
  dates.add(addDays(easter, -48)); // Carnaval, segunda
  dates.add(addDays(easter, -47)); // Carnaval, terça
  dates.add(addDays(easter, -2)); // Sexta-feira Santa
  dates.add(addDays(easter, 60)); // Corpus Christi
  if (year >= 2024) {
    dates.add(`${String(year)}-11-20`); // Consciência Negra
  }
  holidayCache.set(year, dates);
  return dates;
}

export function isBankHoliday(isoDate: string): boolean {
  return holidaysOf(Number(isoDate.slice(0, 4))).has(isoDate);
}

export function isBusinessDay(isoDate: string): boolean {
  const weekday = new Date(toUtcMs(isoDate)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isBankHoliday(isoDate);
}

/** A própria data, se for dia útil; senão, o próximo dia útil. */
export function nextBusinessDay(isoDate: string): string {
  let current = isoDate;
  while (!isBusinessDay(current)) {
    current = addDays(current, 1);
  }
  return current;
}

const saoPauloFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data civil em São Paulo no instante dado (a data UTC já é o dia seguinte entre 21h e 0h). */
export function saoPauloDate(instant: Date): string {
  return saoPauloFormatter.format(instant);
}

/** Primeiro dia do mês seguinte ao da data. */
export function nextMonthStart(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return month === 12
    ? `${String(year + 1)}-01-01`
    : `${String(year)}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Primeiro dia do mês da data. */
export function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 8)}01`;
}
