import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Botao } from './Botao';
import { Breadcrumb } from './Breadcrumb';
import { Campo, CheckboxLgpd } from './Campo';
import { BlocoGrade } from './BlocoGrade';
import { EstadoVazio } from './EstadoVazio';
import { ImovelCard } from './ImovelCard';
import type { ImovelResumo } from './ImovelCard';
import { Logotipo } from './Logotipo';
import { formatarValor } from '@/lib/formato';
import { TIPO_IMOVEL } from '@/lib/tipos';

/**
 * Componentes base do portal (Onda 1B). As regras conferidas aqui são as da
 * entrega de design e do AGENTS.md, não detalhe de estilo: privacidade do
 * endereço, valor em centavos, alvo de toque e estado de erro acessível.
 */

const BASE: ImovelResumo = {
  slug: 'apartamento-2-quartos-setor-bueno',
  tipo: 'apartamento',
  finalidade: 'aluguel',
  bairro: 'Setor Bueno',
  cidade: 'Goiânia',
  uf: 'GO',
  aluguelCents: 240_000,
  condominioCents: 42_000,
  iptuCents: 9_000,
  totalMensalCents: 291_000,
  quartos: 2,
  banheiros: 1,
  vagas: 1,
  areaM2: 68,
  fotos: 12,
  anunciante: { nome: 'Imobiliária Exemplo', creci: 'GO-00000' },
};

describe('Logotipo', () => {
  it('"Achou" em preto e "Imóvel" na cor da seção', () => {
    const html = renderToStaticMarkup(<Logotipo cor="acento" />);
    expect(html).toContain('Achou');
    expect(html).toContain('logo__imovel');
    expect(html).toContain('--logo-imovel-color:var(--brand-accent)');
  });

  it('nas páginas de um tipo, usa a cor do tipo', () => {
    const html = renderToStaticMarkup(<Logotipo cor="casa" />);
    expect(html).toContain('--logo-imovel-color:var(--tipo-casa)');
  });

  it('sobre bloco colorido fica branco', () => {
    const html = renderToStaticMarkup(<Logotipo cor="branco" />);
    expect(html).toContain('var(--brand-on-accent)');
  });
});

describe('ImovelCard', () => {
  it('aluguel destaca o total do mês ("total/mês") e detalha aluguel, "Cond." e IPTU', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={BASE} />);
    expect(html).toContain(`${formatarValor(291_000)} total/mês`);
    expect(html).toContain(
      `Aluguel ${formatarValor(240_000)} · Cond. ${formatarValor(42_000)} · IPTU ${formatarValor(9_000)}`,
    );
  });

  it('venda destaca o preço, com R$/m² e os encargos na linha de apoio, sem "/mês"', () => {
    const html = renderToStaticMarkup(
      <ImovelCard
        imovel={{
          ...BASE,
          finalidade: 'venda',
          precoVendaCents: 89_000_000,
          totalMensalCents: null,
          aluguelCents: null,
          condominioCents: 62_000,
          iptuCents: 21_000,
          areaM2: 170,
        }}
      />,
    );
    expect(html).toContain(formatarValor(89_000_000));
    expect(html).toContain(
      `${formatarValor(89_000_000 / 170)}/m² · Cond. ${formatarValor(62_000)} · IPTU ${formatarValor(21_000)}`,
    );
    expect(html).not.toContain('/mês');
  });

  it('nas duas finalidades mostra o total do mês e "ou … à venda", sem repetir os encargos', () => {
    const html = renderToStaticMarkup(
      <ImovelCard imovel={{ ...BASE, finalidade: 'ambos', precoVendaCents: 21_000_000 }} />,
    );
    expect(html).toContain('total/mês');
    expect(html).toContain(`ou ${formatarValor(21_000_000)} à venda`);
    expect(html).not.toContain('Cond.');
  });

  it('atributos na ordem área · quartos · suítes · vagas, depois mobiliado e pet', () => {
    const html = renderToStaticMarkup(
      <ImovelCard
        imovel={{
          ...BASE,
          areaM2: 72,
          quartos: 2,
          suites: 1,
          vagas: 1,
          mobiliado: true,
          aceitaPet: true,
        }}
      />,
    );
    expect(html).toContain('72 m² · 2 quartos · 1 suíte · 1 vaga · mobiliado · aceita pet');
    expect(html).not.toContain('banheiro');
  });

  it('amostra da identidade: selo da finalidade, lista de atributos e imobiliária com CRECI', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={BASE} variante="amostra" />);
    expect(html).toContain('imovel-card__selo">Alugar<');
    expect(html).toContain('Imobiliária Exemplo · CRECI GO-00000');
    expect(html).toContain('Apartamento · Setor Bueno, Goiânia<');
    expect(
      renderToStaticMarkup(
        <ImovelCard
          imovel={{ ...BASE, finalidade: 'venda', precoVendaCents: 1 }}
          variante="amostra"
        />,
      ),
    ).toContain('>Comprar<');
    expect(
      renderToStaticMarkup(
        <ImovelCard
          imovel={{ ...BASE, finalidade: 'ambos', precoVendaCents: 1 }}
          variante="amostra"
        />,
      ),
    ).toContain('>Alugar ou comprar<');
  });

  it('na lista da busca e da home não há selo nem imobiliária, e o local leva a UF', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={BASE} />);
    expect(html).not.toContain('imovel-card__selo');
    expect(html).not.toContain('CRECI');
    expect(html).toContain('Apartamento · Setor Bueno, Goiânia · GO');
  });

  it('parecido e poucos: sem contador nem linha de apoio; parecido mostra só o bairro', () => {
    const parecido = renderToStaticMarkup(<ImovelCard imovel={BASE} variante="parecido" />);
    expect(parecido).toContain('Apartamento · Setor Bueno<');
    expect(parecido).not.toContain('imovel-card__contador');
    expect(parecido).not.toContain('imovel-card__detalhe');
    const poucos = renderToStaticMarkup(<ImovelCard imovel={BASE} variante="poucos" />);
    expect(poucos).toContain('Apartamento · Setor Bueno, Goiânia · GO');
    expect(poucos).not.toContain('imovel-card__contador');
    expect(poucos).not.toContain('imovel-card__detalhe');
  });

  it('o card inteiro é o link do anúncio', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={BASE} />);
    expect(html).toContain(`href="/imovel/${BASE.slug}"`);
    expect(html).not.toContain('<button');
  });

  it('sem foto mostra o marcador "Foto do imóvel" e não inventa contador', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={{ ...BASE, fotos: 0, fotoUrl: null }} />);
    expect(html).toContain('Foto do imóvel');
    expect(html).not.toContain('imovel-card__contador');
  });

  it('privacidade: só bairro e cidade, nunca endereço nem storage_key', () => {
    const html = renderToStaticMarkup(
      <ImovelCard
        imovel={{ ...BASE, fotoUrl: 'https://exemplo.test/foto.jpg', fotoLegenda: 'Cozinha' }}
      />,
    );
    expect(html).toContain('Setor Bueno');
    expect(html).toContain('Goiânia');
    for (const proibido of ['storage_key', 'storageKey', 'latitude', 'longitude', 'cep', 'CEP']) {
      expect(html).not.toContain(proibido);
    }
  });

  it('atributo ausente ou zerado some, em vez de virar zero', () => {
    const html = renderToStaticMarkup(
      <ImovelCard imovel={{ ...BASE, vagas: 0, suites: null, areaM2: null }} />,
    );
    expect(html).toContain('2 quartos');
    expect(html).not.toContain('vaga');
    expect(html).not.toContain('suíte');
    expect(html).not.toContain('m²');
  });
});

describe('tipos de imóvel', () => {
  it('nomes como nas telas: "Kitnet e studio" e "Sala e loja"', () => {
    expect(TIPO_IMOVEL['kitnet-studio'].nome).toBe('Kitnet e studio');
    expect(TIPO_IMOVEL['sala-loja'].nome).toBe('Sala e loja');
  });
});

describe('Botao', () => {
  it('carregando desabilita, anuncia e mostra o anel girando', () => {
    const html = renderToStaticMarkup(<Botao carregando>Enviar</Botao>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
    expect(html).toContain('botao__anel');
  });

  it('altura e largura das telas viram classe', () => {
    const html = renderToStaticMarkup(
      <Botao altura={52} larguraTotal variante="escuro">
        Cancelar alerta
      </Botao>,
    );
    expect(html).toContain('botao--escuro');
    expect(html).toContain('botao--52');
    expect(html).toContain('botao--total');
  });

  it('variante muda só a classe', () => {
    expect(renderToStaticMarkup(<Botao variante="contorno">Ver</Botao>)).toContain(
      'botao--contorno',
    );
  });
});

describe('Campo e consentimento', () => {
  it('erro liga aria-invalid e aria-describedby', () => {
    const html = renderToStaticMarkup(
      <Campo id="telefone" rotulo="Telefone" erro="Telefone incompleto" />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="telefone-erro"');
    expect(html).toContain('role="alert"');
  });

  it('rótulo aponta para o campo', () => {
    const html = renderToStaticMarkup(<Campo id="nome" rotulo="Nome" />);
    expect(html).toContain('for="nome"');
    expect(html).toContain('id="nome"');
  });

  it('consentimento LGPD nunca nasce marcado', () => {
    const html = renderToStaticMarkup(<CheckboxLgpd id="lgpd" />);
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked');
  });
});

describe('Breadcrumb e estado vazio', () => {
  it('o último trilho é a página atual, não um link', () => {
    const html = renderToStaticMarkup(
      <Breadcrumb trilhos={[{ rotulo: 'Início', href: '/' }, { rotulo: 'Setor Bueno' }]} />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/"');
  });

  it('estado vazio oferece uma saída', () => {
    const html = renderToStaticMarkup(
      <EstadoVazio titulo="Nenhum imóvel" acao={<a href="/alerta">Criar alerta</a>}>
        Tente um bairro vizinho.
      </EstadoVazio>,
    );
    expect(html).toContain('Nenhum imóvel');
    expect(html).toContain('/alerta');
  });
});

describe('BlocoGrade', () => {
  it('usa a cor do tipo e a grade pedida, sem gradiente de cor', () => {
    const html = renderToStaticMarkup(
      <BlocoGrade cor="sobrado" grade="tile">
        Sobrado
      </BlocoGrade>,
    );
    expect(html).toContain('--bloco-cor:var(--tipo-sobrado)');
    expect(html).toContain('--bloco-grade:var(--grid-size-tile)');
  });
});

describe('formatação', () => {
  it('valor em centavos vira real cheio, no padrão pt-BR', () => {
    expect(formatarValor(291_000)).toBe('R$ 2.910');
    expect(formatarValor(null)).toBe('—');
  });
});
