import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanoBloqueado, planoQueAbre } from './plano-bloqueado';
import type { PlanoPublico } from './plano-bloqueado';
import type { SessionPlan } from '@/lib/session';

const ANUNCIANTE: SessionPlan = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'ANUNCIANTE',
  name: 'Anunciante',
  modules: [],
  monthlyPriceCents: null,
  limits: {
    maxUsers: 3,
    maxProperties: 50,
    maxPublishedListings: 20,
    maxActiveLeases: null,
  },
};

const PLANOS: PlanoPublico[] = [
  { code: 'ANUNCIANTE', name: 'Anunciante', modules: [] },
  {
    code: 'GESTAO_LOCACAO',
    name: 'Gestão Locação',
    modules: ['CRM', 'ATENDIMENTO', 'LOCACAO', 'FINANCEIRO', 'MARKETING'],
  },
  { code: 'GESTAO_VENDAS', name: 'Gestão Vendas', modules: ['CRM', 'VENDAS'] },
];

/** Tela de upgrade no lugar do módulo (tela 33 · 01-painel.dc.html#upgrade). */
describe('PlanoBloqueado', () => {
  it('Locações no plano Anunciante: os textos da tela', () => {
    const html = renderToStaticMarkup(
      <PlanoBloqueado
        modulo="LOCACAO"
        plano={ANUNCIANTE}
        item="Locações"
        orgId="org-1"
        podePedir
        portalUrl="https://achouimovel.online"
        planosIniciais={PLANOS}
      />,
    );
    expect(html).toContain('Fora do seu plano');
    expect(html).toContain('Locações estão disponíveis no AchouImóvel Gestão Locação');
    expect(html).toContain(
      'No plano Anunciante você publica nos portais e recebe os leads. Com o Gestão Locação, o mesmo painel passa a administrar contratos, vistorias, cobranças e repasses. Nada do que você já tem muda.',
    );
    for (const item of [
      'Contratos e encargos',
      'Reajuste, renovação e encerramento',
      'Vistoria de entrada e saída',
      'Cobranças com multa e juros',
      'Split e repasse ao proprietário',
      'Área do proprietário e do inquilino',
    ]) {
      expect(html).toContain(item);
    }
    expect(html).toContain('>Pedir o Gestão Locação<');
    expect(html).toContain('href="https://achouimovel.online/planos"');
    expect(html).toContain('A troca de plano é feita pela equipe AchouImóvel.');
  });

  it('não promete e-mail: não há provedor de e-mail (D6)', () => {
    const html = renderToStaticMarkup(
      <PlanoBloqueado modulo="LOCACAO" plano={ANUNCIANTE} planosIniciais={PLANOS} podePedir />,
    );
    expect(html).not.toMatch(/e-mail/i);
  });

  it('com pedido em aberto, mostra o pedido e não oferece pedir de novo', () => {
    const html = renderToStaticMarkup(
      <PlanoBloqueado
        modulo="VENDAS"
        plano={ANUNCIANTE}
        item="Negociações"
        podePedir
        planosIniciais={PLANOS}
        pedidoInicial={{ id: 'p1', status: 'PENDING', createdAt: '2026-09-30T15:00:00.000Z' }}
      />,
    );
    expect(html).toContain('Negociações estão disponíveis no AchouImóvel Gestão Vendas');
    expect(html).toContain('Pedido registrado em 30/09');
    expect(html).not.toContain('Pedir o');
  });

  it('quem não administra a imobiliária não vê o botão de pedir', () => {
    const html = renderToStaticMarkup(
      <PlanoBloqueado modulo="LOCACAO" plano={ANUNCIANTE} planosIniciais={PLANOS} />,
    );
    expect(html).not.toContain('Pedir o');
    expect(html).toContain('a pedido de quem administra a imobiliária');
  });

  it('módulo incluído mas sem tela pronta explica a preparação, não o plano', () => {
    const html = renderToStaticMarkup(
      <PlanoBloqueado
        modulo="VENDAS"
        plano={{ ...ANUNCIANTE, modules: ['VENDAS'] }}
        emPreparacao
      />,
    );
    expect(html).toContain('em preparação');
    expect(html).not.toContain('Fora do seu plano');
  });

  it('sem módulo conhecido ainda explica a tela', () => {
    const html = renderToStaticMarkup(<PlanoBloqueado modulo={null} plano={null} />);
    expect(html).toContain('Esta parte está fora do seu plano');
  });

  it('oferece o plano mais barato que inclui o módulo; sem preço vai por último', () => {
    const semPreco = [
      { code: 'ILIMITADO', name: 'Ilimitado', modules: ['CRM', 'LOCACAO', 'VENDAS'] as const },
      { code: 'ESSENCIAL', name: 'Essencial', modules: ['CRM', 'LOCACAO'] as const },
      { code: 'PROFISSIONAL', name: 'Profissional', modules: ['CRM', 'LOCACAO'] as const },
    ].map((plano) => ({ ...plano, modules: [...plano.modules], monthlyPriceCents: null }));
    // Tudo sem preço: o de menos módulos e, no empate, o código.
    expect(planoQueAbre(semPreco, 'LOCACAO')?.code).toBe('ESSENCIAL');
    expect(planoQueAbre(semPreco, 'VENDAS')?.code).toBe('ILIMITADO');
    // Com preço público, a oferta concreta vem antes da "Fale com a gente".
    const comPreco = [
      ...semPreco,
      {
        code: 'GESTAO_LOCACAO',
        name: 'Gestão Locação',
        modules: ['CRM', 'LOCACAO', 'FINANCEIRO'] as PlanoPublico['modules'],
        monthlyPriceCents: 29_900,
      },
    ];
    expect(planoQueAbre(comPreco, 'LOCACAO')?.code).toBe('GESTAO_LOCACAO');
    expect(planoQueAbre(comPreco, 'MARKETING')).toBeNull();
  });
});
