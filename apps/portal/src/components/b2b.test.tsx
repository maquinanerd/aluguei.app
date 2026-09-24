import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicPlan } from '@aluguei/contracts';
import { FaqPlanos, TabelaPlanos } from './b2b';

/**
 * Telas B2B (Onda 3). O que é conferido aqui não é estilo: é o que a página
 * afirma. Preço que não existe não vira zero, plano sem módulo não ganha recurso
 * que não tem, e o FAQ estruturado tem de repetir o texto visível — dado
 * estruturado que não bate com a página é violação de diretriz.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function plano(parcial: Partial<PublicPlan> = {}): PublicPlan {
  return {
    code: 'ANUNCIANTE',
    name: 'Anunciante',
    description: 'Anúncios no portal e caixa de leads.',
    maxUsers: null,
    maxProperties: null,
    maxPublishedListings: 20,
    maxActiveLeases: null,
    modules: [],
    monthlyPriceCents: null,
    ...parcial,
  };
}

describe('TabelaPlanos', () => {
  it('sem planos, diz que não carregou — não afirma que não existe plano', () => {
    const html = renderToStaticMarkup(<TabelaPlanos planos={[]} />);
    expect(html).toContain('Planos indisponíveis agora');
    expect(html).not.toContain('R$');
  });

  it('plano sem preço aparece como "Fale com a gente", nunca como zero', () => {
    const html = renderToStaticMarkup(<TabelaPlanos planos={[plano()]} />);
    expect(html).toContain('Fale com a gente');
    expect(html).not.toContain('R$ 0');
  });

  it('o botão leva ao cadastro com o código do plano', () => {
    vi.stubEnv('APP_BASE_URL', 'https://app.achouimovel.online');
    const html = renderToStaticMarkup(
      <TabelaPlanos planos={[plano({ code: 'GESTAO_LOCACAO' })]} />,
    );
    expect(html).toContain('https://app.achouimovel.online/register?plano=GESTAO_LOCACAO');
  });

  it('célula de recurso fora do plano não é marcada como incluída', () => {
    const html = renderToStaticMarkup(<TabelaPlanos planos={[plano({ modules: [] })]} />);
    expect(html).toContain('Não incluído');
    // O recurso que todo plano tem continua marcado.
    expect(html).toContain('Incluído');
    expect(html).toContain('Anúncios no portal');
  });

  it('recurso ainda não ligado leva o selo em vez de prometer', () => {
    const html = renderToStaticMarkup(
      <TabelaPlanos planos={[plano({ modules: ['LOCACAO', 'FINANCEIRO'] })]} />,
    );
    expect(html).toContain('em breve');
  });
});

describe('FaqPlanos', () => {
  it('o JSON-LD repete a pergunta e a resposta que estão na página', () => {
    const perguntas = [{ pergunta: 'Posso anunciar sem usar o sistema?', resposta: 'Pode, sim.' }];
    const html = renderToStaticMarkup(<FaqPlanos titulo="Perguntas" perguntas={perguntas} />);
    expect(html).toContain('application/ld+json');
    expect(html).toContain('FAQPage');
    expect(html).toContain('Posso anunciar sem usar o sistema?');
    expect(html).toContain('Pode, sim.');
  });
});
