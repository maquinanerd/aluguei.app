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
  it('aluguel destaca o total do mês e detalha os valores separados', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={BASE} />);
    expect(html).toContain('/mês');
    expect(html).toContain(formatarValor(291_000));
    expect(html).toContain(`Aluguel ${formatarValor(240_000)}`);
    expect(html).toContain('IPTU');
  });

  it('venda destaca o preço, sem "/mês"', () => {
    const html = renderToStaticMarkup(
      <ImovelCard
        imovel={{
          ...BASE,
          finalidade: 'venda',
          precoVendaCents: 74_000_000,
          totalMensalCents: null,
          aluguelCents: null,
        }}
      />,
    );
    expect(html).toContain(formatarValor(74_000_000));
    expect(html).not.toContain('/mês');
  });

  it('nas duas finalidades mostra aluguel e venda na mesma linha', () => {
    const html = renderToStaticMarkup(
      <ImovelCard imovel={{ ...BASE, finalidade: 'ambos', precoVendaCents: 98_000_000 }} />,
    );
    expect(html).toContain('/mês');
    expect(html).toContain(`ou ${formatarValor(98_000_000)} à venda`);
  });

  it('o card inteiro é o link do anúncio', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={BASE} />);
    expect(html).toContain(`href="/imovel/${BASE.slug}"`);
    expect(html).not.toContain('<button');
  });

  it('sem foto não inventa contador', () => {
    const html = renderToStaticMarkup(<ImovelCard imovel={{ ...BASE, fotos: 0, fotoUrl: null }} />);
    expect(html).toContain('Sem foto');
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

  it('atributo ausente some, em vez de virar zero', () => {
    const html = renderToStaticMarkup(
      <ImovelCard imovel={{ ...BASE, vagas: null, areaM2: null }} />,
    );
    expect(html).toContain('2 quartos');
    expect(html).not.toContain('vaga');
    expect(html).not.toContain('m²');
  });
});

describe('Botao', () => {
  it('carregando desabilita e anuncia', () => {
    const html = renderToStaticMarkup(<Botao carregando>Enviar</Botao>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
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
