import { describe, expect, it } from 'vitest';
import type { PublicPlan } from '@aluguei/contracts';
import { RECURSOS, limiteDoPlano, planoTemRecurso, precoDoPlano } from './planos';

/**
 * Tabela de planos do B2B (Onda 3). O que este teste protege é a regra do
 * AGENTS.md sobre número inventado: a página não pode afirmar preço, limite nem
 * recurso que o plano não tem. Tudo sai do que a API devolveu.
 */

function plano(parcial: Partial<PublicPlan> = {}): PublicPlan {
  return {
    code: 'TESTE',
    name: 'Plano de teste',
    description: null,
    maxUsers: null,
    maxProperties: null,
    maxPublishedListings: null,
    maxActiveLeases: null,
    modules: [],
    monthlyPriceCents: null,
    ...parcial,
  };
}

describe('recursos por módulo', () => {
  it('recurso sem módulo está em todo plano, inclusive no que não tem nenhum', () => {
    const anunciante = plano({ modules: [] });
    const semModulo = RECURSOS.filter((recurso) => recurso.modulo === null);
    expect(semModulo.length).toBeGreaterThan(0);
    for (const recurso of semModulo) {
      expect(planoTemRecurso(anunciante, recurso)).toBe(true);
    }
  });

  it('recurso de módulo só entra no plano que tem aquele módulo', () => {
    const soCrm = plano({ modules: ['CRM'] });
    const crm = RECURSOS.find((recurso) => recurso.modulo === 'CRM');
    const locacao = RECURSOS.find((recurso) => recurso.modulo === 'LOCACAO');
    if (crm === undefined || locacao === undefined) {
      throw new Error('a lista de recursos perdeu CRM ou LOCACAO');
    }
    expect(planoTemRecurso(soCrm, crm)).toBe(true);
    expect(planoTemRecurso(soCrm, locacao)).toBe(false);
  });

  it('todo recurso aponta para um módulo que existe no domínio, ou para nenhum', () => {
    const modulos = ['CRM', 'ATENDIMENTO', 'LOCACAO', 'FINANCEIRO', 'VENDAS', 'MARKETING'];
    for (const recurso of RECURSOS) {
      if (recurso.modulo !== null) {
        expect(modulos).toContain(recurso.modulo);
      }
    }
  });
});

describe('preço da coluna', () => {
  it('sem preço publicado não é zero nem grátis: é "Fale com a gente"', () => {
    const resultado = precoDoPlano(plano({ monthlyPriceCents: null }));
    expect(resultado).toEqual({ valor: 'Fale com a gente', porMes: false });
  });

  it('preço em centavos vira reais, sem arredondar para cima', () => {
    const resultado = precoDoPlano(plano({ monthlyPriceCents: 19_990 }));
    expect(resultado.porMes).toBe(true);
    expect(resultado.valor).toContain('199,90');
  });
});

describe('como o plano é cobrado', () => {
  it('locações em vigor vêm antes de usuários e de anúncios', () => {
    expect(limiteDoPlano(plano({ maxActiveLeases: 200, maxUsers: 5 }))).toBe(
      'Até 200 contratos de locação ativos',
    );
    expect(limiteDoPlano(plano({ maxUsers: 5, maxPublishedListings: 20 }))).toBe('Até 5 usuários');
    expect(limiteDoPlano(plano({ maxPublishedListings: 20 }))).toBe('Até 20 anúncios publicados');
  });

  it('sem limite nenhum não inventa número', () => {
    expect(limiteDoPlano(plano())).toBe('Sem limite de uso');
  });
});
