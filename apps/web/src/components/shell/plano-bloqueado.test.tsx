import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanoBloqueado } from './plano-bloqueado';
import type { SessionPlan } from '@/lib/session';

const PLANO: SessionPlan = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'ESSENCIAL',
  name: 'Essencial',
  modules: ['CRM', 'LOCACAO'],
  monthlyPriceCents: null,
  limits: {
    maxUsers: 3,
    maxProperties: 50,
    maxPublishedListings: 20,
    maxActiveLeases: null,
  },
};

/** Tela "Fora do seu plano" (entrega de design · gestao/01-painel · upgrade). */
describe('PlanoBloqueado', () => {
  it('diz qual módulo falta e o que ele faz', () => {
    const html = renderToStaticMarkup(<PlanoBloqueado modulo="VENDAS" plano={PLANO} />);
    expect(html).toContain('Vendas está fora do seu plano');
    expect(html).toContain('Negociações de venda');
    expect(html).toContain('Essencial');
  });

  it('módulo incluído mas sem tela pronta explica a preparação, não o plano', () => {
    const html = renderToStaticMarkup(
      <PlanoBloqueado modulo="VENDAS" plano={{ ...PLANO, modules: ['VENDAS'] }} emPreparacao />,
    );
    expect(html).toContain('em preparação');
    expect(html).not.toContain('fora do seu plano');
  });

  it('plano só com anúncio não finge ter módulo', () => {
    const html = renderToStaticMarkup(
      <PlanoBloqueado modulo="FINANCEIRO" plano={{ ...PLANO, modules: [] }} />,
    );
    expect(html).toContain('Financeiro está fora do seu plano');
    expect(html).toContain('Só anúncios no portal e caixa de leads.');
  });

  it('sem plano na sessão ainda explica a tela', () => {
    const html = renderToStaticMarkup(<PlanoBloqueado modulo={null} plano={null} />);
    expect(html).toContain('Este módulo está fora do seu plano');
  });
});
