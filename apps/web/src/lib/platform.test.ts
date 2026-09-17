import { describe, expect, it } from 'vitest';
import { eventLabel, formatLimit, limitFor, parseLimitInput, usageLabel } from './platform';

describe('rótulos do admin da plataforma', () => {
  it('limite nulo é ilimitado', () => {
    expect(formatLimit(null)).toBe('Ilimitado');
    expect(formatLimit(1500)).toBe('1.500');
  });

  it('uso com e sem limite', () => {
    expect(usageLabel(3, 50)).toBe('3 de 50');
    expect(usageLabel(1200, null)).toBe('1.200');
  });

  it('limite por recurso', () => {
    const plan = { maxUsers: 3, maxProperties: null, maxPublishedListings: 20 };
    expect(limitFor(plan, 'users')).toBe(3);
    expect(limitFor(plan, 'properties')).toBeNull();
    expect(limitFor(plan, 'publishedListings')).toBe(20);
  });

  it('evento desconhecido mostra a ação crua', () => {
    expect(eventLabel('platform.organization.approved')).toBe('Aprovada');
    expect(eventLabel('outra.acao')).toBe('outra.acao');
  });
});

describe('limite digitado no formulário de plano', () => {
  it('vazio é ilimitado; inteiro dentro da faixa é aceito', () => {
    expect(parseLimitInput('  ', 1)).toEqual({ ok: true, value: null });
    expect(parseLimitInput('50', 0)).toEqual({ ok: true, value: 50 });
    expect(parseLimitInput('0', 0)).toEqual({ ok: true, value: 0 });
  });

  it('recusa abaixo do mínimo, decimal, negativo, texto e acima do teto', () => {
    expect(parseLimitInput('0', 1).ok).toBe(false);
    expect(parseLimitInput('2.5', 0).ok).toBe(false);
    expect(parseLimitInput('-1', 0).ok).toBe(false);
    expect(parseLimitInput('dez', 0).ok).toBe(false);
    expect(parseLimitInput('1000001', 0).ok).toBe(false);
  });
});
