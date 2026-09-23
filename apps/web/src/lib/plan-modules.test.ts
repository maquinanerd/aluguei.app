import { describe, expect, it } from 'vitest';
import { PLAN_MODULES } from '@aluguei/domain';
import { NAV_GROUPS } from './navigation';
import { MODULOS_DO_PLANO, moduloDe } from './plan-modules';
import { hasModule } from './session';
import type { Session, SessionPlan } from './session';

/**
 * Cadeado por plano na navegação (Onda 1B, ADR-095). O vocabulário do menu é o
 * mesmo do domínio e da API: o que não está no plano aparece bloqueado.
 */

const PLANO_GESTAO: SessionPlan = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'ESSENCIAL',
  name: 'Essencial',
  modules: ['CRM', 'ATENDIMENTO', 'LOCACAO', 'FINANCEIRO', 'MARKETING'],
  monthlyPriceCents: null,
  limits: {
    maxUsers: 3,
    maxProperties: 50,
    maxPublishedListings: 20,
    maxActiveLeases: null,
  },
};

function sessaoCom(plan: SessionPlan | null): Session {
  return {
    user: { id: 'u1', email: 'gestor@example.com', name: 'Gestor' },
    activeOrg: {
      id: 'o1',
      name: 'Imobiliária',
      slug: 'imobiliaria',
      status: 'ACTIVE',
      statusReason: null,
    },
    memberships: [{ id: 'm1', orgId: 'o1', role: 'owner', createdAt: '2026-01-01T00:00:00.000Z' }],
    plan,
    platformAdmin: false,
  };
}

describe('módulos do plano na navegação', () => {
  it('o plano com o módulo abre; sem o módulo, não', () => {
    const sessao = sessaoCom(PLANO_GESTAO);
    expect(hasModule(sessao, 'LOCACAO')).toBe(true);
    expect(hasModule(sessao, 'VENDAS')).toBe(false);
  });

  it('sem plano na sessão, nada é liberado por engano', () => {
    const sessao = sessaoCom(null);
    expect(hasModule(sessao, 'CRM')).toBe(false);
    expect(hasModule(sessao, 'FINANCEIRO')).toBe(false);
  });

  it('o menu tem o grupo Vendas com Negociações marcado como Novo', () => {
    const vendas = NAV_GROUPS.find((grupo) => grupo.title === 'Vendas');
    expect(vendas).toBeDefined();
    const negociacoes = vendas?.items[0];
    expect(negociacoes?.href).toBe('/app/vendas/negociacoes');
    expect(negociacoes?.module).toBe('VENDAS');
    expect(negociacoes?.novo).toBe(true);
    // A tela ainda não existe (fase de Vendas): o item explica em vez de dar 404.
    expect(negociacoes?.emPreparacao).toBe(true);
  });

  it('itens de módulo carregam o módulo certo e a base segue sem módulo', () => {
    const porRota = new Map(
      NAV_GROUPS.flatMap((grupo) => grupo.items).map((item) => [item.href, item.module ?? null]),
    );
    expect(porRota.get('/app/leases')).toBe('LOCACAO');
    expect(porRota.get('/app/charges')).toBe('FINANCEIRO');
    expect(porRota.get('/app/inbox')).toBe('ATENDIMENTO');
    expect(porRota.get('/app/crm/pipeline')).toBe('CRM');
    expect(porRota.get('/app/marketing')).toBe('MARKETING');
    // Base de todo plano, inclusive o Anunciante.
    expect(porRota.get('/app/properties')).toBeNull();
    expect(porRota.get('/app/listings')).toBeNull();
    expect(porRota.get('/app/crm/leads')).toBeNull();
    expect(porRota.get('/app/reporting')).toBeNull();
  });

  it('o vocabulario da interface e o mesmo do dominio', () => {
    // O painel importa so o tipo de @aluguei/domain (o pacote e codigo de
    // servidor e entrar nele em tempo de execucao quebra o build do Next).
    // Aqui, em teste, da para comparar as duas listas de verdade.
    expect([...MODULOS_DO_PLANO].sort()).toEqual([...PLAN_MODULES].sort());
  });

  it('modulo vindo da URL so vale se existir', () => {
    expect(moduloDe('VENDAS')).toBe('VENDAS');
    expect(moduloDe('vendas')).toBeNull();
    expect(moduloDe('INVENTADO')).toBeNull();
    expect(moduloDe(undefined)).toBeNull();
  });
});
