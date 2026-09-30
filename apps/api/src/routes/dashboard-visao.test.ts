import { describe, expect, it } from 'vitest';
import { dataEmSaoPaulo, inicioDaSemana, intercalar } from './dashboard-visao.js';
import type { QueueItem } from './dashboard-visao.js';

/** Peças puras da Visão Geral (ADR-105, B14; tela 32). As consultas estão nos testes de integração. */

const lead = (id: string): QueueItem => ({
  kind: 'LEAD',
  tone: 'danger',
  id,
  name: null,
  source: null,
  channel: null,
  at: '2026-09-28T11:42:00.000Z',
});
const visita = (id: string): QueueItem => ({
  kind: 'VISIT',
  tone: 'neutral',
  id,
  name: null,
  property: null,
  status: 'SCHEDULED',
  at: '2026-09-28T13:30:00.000Z',
});
const canal = (id: string): QueueItem => ({
  kind: 'CHANNEL',
  tone: 'warning',
  id,
  channel: 'olx',
  propertyCode: null,
  error: null,
  at: '2026-09-27T20:00:00.000Z',
});

/** Dia civil de São Paulo (UTC-3 fixo desde 2019) que começa na data informada. */
function dia(data: string) {
  const start = new Date(`${data}T03:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

describe('intercalar', () => {
  it('um de cada tipo antes de repetir tipo, até o tamanho da fila', () => {
    const grupos = [[lead('l1'), lead('l2')], [visita('v1')], [], [canal('c1'), canal('c2')]];
    expect(intercalar(grupos, 5).map((item) => item.id)).toEqual(['l1', 'v1', 'c1', 'l2', 'c2']);
    expect(intercalar(grupos, 3).map((item) => item.id)).toEqual(['l1', 'v1', 'c1']);
  });

  it('com menos itens que o tamanho, devolve todos; sem nenhum, a fila vazia', () => {
    expect(intercalar([[lead('l1')], [canal('c1')]], 5).map((item) => item.id)).toEqual([
      'l1',
      'c1',
    ]);
    expect(intercalar([[], []], 5)).toEqual([]);
  });
});

describe('semana e data de São Paulo', () => {
  it('a semana começa na segunda-feira, 00:00 em São Paulo', () => {
    const segunda = '2026-09-28T03:00:00.000Z';
    // Segunda 28/09 (o relógio dos prints), quarta 30/09 e domingo 04/10: a mesma semana.
    expect(inicioDaSemana(dia('2026-09-28')).toISOString()).toBe(segunda);
    expect(inicioDaSemana(dia('2026-09-30')).toISOString()).toBe(segunda);
    expect(inicioDaSemana(dia('2026-10-04')).toISOString()).toBe(segunda);
    expect(inicioDaSemana(dia('2026-10-05')).toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });

  it('a data civil é a de São Paulo, não a de UTC', () => {
    // 23:30 de domingo em São Paulo já é segunda em UTC.
    expect(dataEmSaoPaulo(new Date('2026-09-28T02:30:00.000Z'))).toBe('2026-09-27');
    expect(dataEmSaoPaulo(new Date('2026-09-28T12:12:00.000Z'))).toBe('2026-09-28');
  });
});
