import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlertaImovel } from './AlertaImovel';
import { Breadcrumb } from './Breadcrumb';
import { CheckboxLgpd } from './Campo';
import { EstadoVazio } from './EstadoVazio';
import { BotoesQuartos, ChipsDeFiltro, OpcaoMarcavel, Ordenacao, ReguaValor } from './Filtros';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { FaixaTipo, Paginacao } from './busca';

/**
 * Componentes base nas formas das telas (Onda 1B2 da rodada de fidelidade, ADR-105). O que se
 * confere aqui é regra e texto das telas, não medida: medida é conferida na captura da tela 01.
 */

describe('SiteHeader', () => {
  it('consumidor: Alugar, Comprar, Cidades e "Anunciar imóvel"; o item da página fica marcado', () => {
    const html = renderToStaticMarkup(<SiteHeader ativo="/alugar" />);
    for (const texto of ['>Alugar<', '>Comprar<', '>Cidades<', '>Anunciar imóvel<']) {
      expect(html).toContain(texto);
    }
    expect(html).toMatch(/class="cabecalho__item--ativo" aria-current="page"[^>]*>Alugar</);
    expect(html).toContain('aria-label="Buscar imóveis"');
  });

  it('B2B: as páginas para imobiliárias, "Entrar" e "Começar" levam ao painel', () => {
    const html = renderToStaticMarkup(<SiteHeader variante="b2b" ativo="/planos" />);
    expect(html).toContain('>Para imobiliárias<');
    expect(html).toContain('/login"');
    expect(html).toMatch(/href="[^"]*\/register"[^>]*>Começar</);
    expect(html).not.toContain('Anunciar imóvel</a>');
  });

  it('só logo: sem navegação; "Anunciar imóvel" só quando pedido (o 404 não tem)', () => {
    const sem = renderToStaticMarkup(<SiteHeader variante="logo" />);
    expect(sem).not.toContain('cabecalho__nav');
    expect(sem).not.toContain('cabecalho__acao');
    expect(renderToStaticMarkup(<SiteHeader variante="logo" comAcao />)).toContain(
      'cabecalho__acao',
    );
  });

  it('anúncio no celular: "←" de volta no lugar do menu', () => {
    const html = renderToStaticMarkup(<SiteHeader voltar="/alugar/goiania-go" />);
    expect(html).toContain('aria-label="Voltar"');
    expect(html).not.toContain('Abrir menu');
  });
});

describe('SiteFooter', () => {
  it('colunas no desktop e acordeão no celular, com os mesmos links', () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    expect(html).toContain('rodape__acordeao');
    expect(html.match(/href="\/mapa-do-site"/g)).toHaveLength(2);
    expect(html).toContain('<summary class="rodape__grupo-titulo">Sobre o AchouImóvel');
  });

  it('sem razão social, CNPJ nem links legais, as linhas somem em vez de inventar dado', () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    expect(html).not.toContain('CNPJ');
    expect(html).not.toContain('rodape__legais');
    expect(renderToStaticMarkup(<SiteFooter razaoSocial="AchouImóvel Ltda." cnpj="1" />)).toContain(
      '<b>AchouImóvel Ltda.</b> CNPJ 1',
    );
  });
});

describe('FaixaTipo e Breadcrumb', () => {
  it('a trilha fica dentro da faixa, com "›" entre os níveis e a página atual sem link', () => {
    const html = renderToStaticMarkup(
      <FaixaTipo
        tipo="apartamento"
        titulo="48 apartamentos"
        trilhos={[{ rotulo: 'Aluguel', href: '/alugar' }, { rotulo: 'Goiânia' }]}
        links={[{ rotulo: 'Ver 31 à venda no Setor Bueno', href: '/comprar/goiania-go' }]}
      />,
    );
    expect(html).toContain('trilha--faixa');
    expect(html).toContain('›');
    expect(html).toContain('aria-current="page">Goiânia');
    expect(html).toContain('Ver 31 à venda no Setor Bueno →');
    expect(html.indexOf('trilha')).toBeLessThan(html.indexOf('<h1'));
  });

  it('fora da faixa a trilha é a cinza do anúncio', () => {
    const html = renderToStaticMarkup(<Breadcrumb trilhos={[{ rotulo: 'Aluguel' }]} />);
    expect(html).toContain('trilha--pagina');
  });
});

describe('filtros da busca', () => {
  it('opção de página é link com a página atual marcada; de formulário, caixa de marcar', () => {
    const tipo = renderToStaticMarkup(
      <OpcaoMarcavel rotulo="Apartamento" tipo="apartamento" contagem={48} marcado href="/a" />,
    );
    expect(tipo).toContain('aria-current="page"');
    expect(tipo).toContain('>48<');
    const extra = renderToStaticMarkup(
      <OpcaoMarcavel rotulo="Mobiliado" marcado={false} nome="com" valor="mobiliado" />,
    );
    expect(extra).toContain('type="checkbox"');
    expect(extra).toContain('name="com"');
  });

  it('quartos em quatro botões, o escolhido marcado', () => {
    const html = renderToStaticMarkup(
      <BotoesQuartos
        opcoes={['1', '2', '3', '4+'].map((rotulo) => ({
          rotulo,
          href: '#',
          marcado: rotulo === '2',
        }))}
      />,
    );
    expect(html.match(/quartos__opcao/g)).toHaveLength(5);
    expect(html).toContain('quartos__opcao--marcada');
  });

  it('régua de valor é um input de faixa de verdade, com o teto em verde', () => {
    const html = renderToStaticMarkup(
      <ReguaValor
        nome="ate"
        valorCents={300_000}
        minimoCents={0}
        maximoCents={500_000}
        passoCents={10_000}
      />,
    );
    expect(html).toContain('type="range"');
    expect(html).toContain('Aluguel + condomínio + IPTU');
  });

  it('ordenação: "Ordenar: mais recentes" no desktop e "Mais recentes" no celular', () => {
    const desktop = renderToStaticMarkup(<Ordenacao valor="RECENT" />);
    expect(desktop).toContain('Ordenar:');
    expect(desktop).toContain('>mais recentes<');
    const celular = renderToStaticMarkup(<Ordenacao valor="RECENT" tamanho="celular" />);
    expect(celular).toContain('>Mais recentes<');
  });

  it('chips removíveis são links sem o filtro, com "Limpar tudo"', () => {
    const html = renderToStaticMarkup(
      <ChipsDeFiltro chips={[{ rotulo: '2 quartos', hrefRemover: '/sem' }]} hrefLimpar="/tudo" />,
    );
    expect(html).toContain('href="/sem"');
    expect(html).toContain('×');
    expect(html).toContain('>Limpar tudo<');
  });

  it('paginação numerada com a atual em destaque e "Próxima →"', () => {
    const html = renderToStaticMarkup(<Paginacao pagina={1} totalPaginas={3} caminhoBase="/b" />);
    expect(html).toContain('aria-current="page">1<');
    expect(html).toContain('href="/b?pagina=2"');
    expect(html).toContain('Próxima →');
    expect(html).not.toContain('Anterior');
  });
});

describe('AlertaImovel', () => {
  it('bloco da busca: sobretítulo, título do recorte e só e-mail (sem WhatsApp)', () => {
    const html = renderToStaticMarkup(
      <AlertaImovel
        purpose="RENT"
        city="goiania-go"
        sobretitulo="Alerta de imóvel"
        titulo="Receba os novos apartamentos de 2 quartos no Setor Bueno."
      />,
    );
    expect(html).toContain('alerta--bloco');
    expect(html).toContain('>Alerta de imóvel<');
    expect(html).toContain('Receba os novos apartamentos de 2 quartos no Setor Bueno.');
    expect(html).toContain('placeholder="seu@email.com"');
    expect(html).toContain('value="EMAIL"');
    expect(html).not.toContain('WhatsApp');
  });

  it('sem a página de privacidade, o consentimento não cita uma política que não existe', () => {
    const html = renderToStaticMarkup(
      <AlertaImovel purpose="RENT" city="goiania-go" forma="modal" titulo="Avisamos" />,
    );
    expect(html).toContain('Aceito receber avisos de novos imóveis desta busca.');
    expect(html).not.toContain('política de privacidade');
  });

  it('modal mostra o resumo em chips; caixa sem sobretítulo é a da busca vazia', () => {
    const modal = renderToStaticMarkup(
      <AlertaImovel
        purpose="RENT"
        city="goiania-go"
        forma="modal"
        titulo="Avisamos quando aparecer um imóvel assim"
        chips={['Alugar', '2 quartos']}
      />,
    );
    expect(modal).toContain('chip--etiqueta');
    const vazia = renderToStaticMarkup(
      <AlertaImovel
        purpose="SALE"
        city="goiania-go"
        forma="caixa"
        titulo="Criar alerta para esta busca"
      />,
    );
    expect(vazia).toContain('alerta--caixa');
    expect(vazia).not.toContain('alerta__sobretitulo');
  });
});

describe('estados', () => {
  it('estado vazio com sugestões de outras buscas', () => {
    const html = renderToStaticMarkup(
      <EstadoVazio
        titulo="Nenhum imóvel com esses filtros agora."
        sugestoes={[{ rotulo: '3 quartos à venda no Setor Bueno', href: '/x' }]}
      />,
    );
    expect(html).toContain('chip--sugestao');
    expect(html).toContain('href="/x"');
  });

  it('consentimento com erro: caixa vermelha e a mensagem no lugar do texto, que segue no HTML', () => {
    const html = renderToStaticMarkup(
      <CheckboxLgpd id="c" erro="Marque a autorização para enviar." />,
    );
    expect(html).toContain('consentimento--erro');
    expect(html).toContain('Marque a autorização para enviar.');
    expect(html).toContain('visualmente-oculto');
  });
});
