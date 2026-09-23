import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  PLAN_MODULES,
  assertPlanIncludesModule,
  isPlanModule,
  normalizePlanModules,
  planIncludesModule,
} from './plan-modules.js';

describe('módulos do plano', () => {
  it('reconhece só os códigos do domínio', () => {
    expect(isPlanModule('LOCACAO')).toBe(true);
    expect(isPlanModule('locacao')).toBe(false);
    expect(isPlanModule('QUALQUER')).toBe(false);
  });

  it('o plano inclui o que está na lista', () => {
    expect(planIncludesModule(['CRM', 'LOCACAO'], 'LOCACAO')).toBe(true);
    expect(planIncludesModule(['CRM'], 'VENDAS')).toBe(false);
    expect(planIncludesModule([], 'CRM')).toBe(false);
  });

  it('módulo fora do plano vira 403 com o motivo que a interface usa', () => {
    try {
      assertPlanIncludesModule(['CRM'], 'VENDAS');
      expect.unreachable('devia recusar');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domainError = error as DomainError;
      expect(domainError.code).toBe('FORBIDDEN');
      expect(domainError.details).toEqual({
        reason: 'PLAN_MODULE_NOT_INCLUDED',
        module: 'VENDAS',
      });
      // A mensagem é lida por gente, não por código.
      expect(domainError.message).toContain('Vendas');
    }
  });

  it('módulo incluído passa sem lançar', () => {
    expect(() => {
      assertPlanIncludesModule([...PLAN_MODULES], 'FINANCEIRO');
    }).not.toThrow();
  });

  it('descarta código desconhecido vindo do banco e mantém a ordem do domínio', () => {
    expect(normalizePlanModules(['MARKETING', 'INVENTADO', 'CRM', 'CRM'])).toEqual([
      'CRM',
      'MARKETING',
    ]);
    expect(normalizePlanModules([])).toEqual([]);
  });
});
