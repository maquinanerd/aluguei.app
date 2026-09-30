import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImovelCard } from '@/components/ImovelCard';
import { TIPO_IMOVEL } from '@/lib/tipos';
import { CARDS_DE_AMOSTRA, ESCALA_DE_TIPO, RAIO, TIPOS, TOKENS_DE_COR } from './identidade';

/**
 * A tela 01 (`telas/portal/00-identidade.dc.html`) mostra tabelas de token e cards de amostra. Aqui
 * se confere que a página não mente: cada valor da tabela é o que `tokens.css` aplica, e o card de
 * verdade, com os dados do `renderVals()`, escreve exatamente os textos da tela.
 */

const TOKENS = readFileSync(
  fileURLToPath(new URL('../../../styles/tokens.css', import.meta.url)),
  'utf8',
).toLowerCase();

// O Intl põe espaço sem quebra entre "R$" e o número; a tela usa espaço comum.
const NBSP = String.fromCharCode(160);
const semNbsp = (html: string) => html.split(NBSP).join(' ');

describe('tabelas da identidade × tokens.css', () => {
  it('cada cor da tabela é a do token', () => {
    for (const token of TOKENS_DE_COR) {
      expect(TOKENS).toContain(`${token.nome}: ${token.valor.toLowerCase()};`);
    }
  });

  it('cada linha da escala tem o peso e o tamanho do token', () => {
    for (const token of ESCALA_DE_TIPO) {
      const linha = TOKENS.split('\n').find((texto) => texto.includes(`${token.nome}:`));
      expect(linha, token.nome).toBeDefined();
      expect(linha).toContain(`: ${token.peso} `);
      // "18–20px/1.2" e "clamp(30px,4.2vw,52px)/1.1": o mínimo, o máximo e a altura de linha.
      const numeros = token.tamanho.match(/\d+(\.\d+)?px|\/[\d.]+/g) ?? [];
      for (const numero of numeros) {
        expect(linha, `${token.nome} ${numero}`).toContain(numero);
      }
    }
  });

  it('raio e cores por tipo são os dos tokens', () => {
    expect(TOKENS).toContain('--portal-radius-structure: 0;');
    expect(TOKENS).toContain('--portal-radius: 4px;');
    expect(TOKENS).toContain('--radius-avatar: 50%;');
    expect(RAIO).toHaveLength(3);
    for (const amostra of TIPOS) {
      const token = TIPO_IMOVEL[amostra.tipo].cor.replace(/^var\((.+)\)$/, '$1');
      expect(TOKENS).toContain(`${token}: ${amostra.fundo.toLowerCase()};`);
    }
  });
});

describe('cards de amostra = textos da tela', () => {
  const [aluguel, venda, ambos] = CARDS_DE_AMOSTRA.map((imovel) =>
    semNbsp(renderToStaticMarkup(<ImovelCard imovel={imovel} variante="amostra" />)),
  );

  it('aluguel', () => {
    expect(aluguel).toContain('>Alugar<');
    expect(aluguel).toContain('>1/12<');
    expect(aluguel).toContain('Apartamento · Setor Bueno, Goiânia<');
    expect(aluguel).toContain('>R$ 2.910 total/mês<');
    expect(aluguel).toContain('>Aluguel R$ 2.300 · Cond. R$ 480 · IPTU R$ 130<');
    expect(aluguel).toContain(
      '<span>72 m²</span><span>2 quartos</span><span>1 suíte</span><span>1 vaga</span>',
    );
    expect(aluguel).toContain('>Imobiliária Exemplo · CRECI 0000-J<');
  });

  it('venda', () => {
    expect(venda).toContain('>Comprar<');
    expect(venda).toContain('>1/18<');
    expect(venda).toContain('Casa de condomínio · Jardins Atenas, Goiânia<');
    expect(venda).toContain('>R$ 890.000<');
    expect(venda).toContain('>R$ 5.235/m² · Cond. R$ 620 · IPTU R$ 210<');
    expect(venda).toContain(
      '<span>170 m²</span><span>3 quartos</span><span>3 suítes</span><span>2 vagas</span>',
    );
  });

  it('os dois', () => {
    expect(ambos).toContain('>Alugar ou comprar<');
    expect(ambos).toContain('>1/9<');
    expect(ambos).toContain('Kitnet e studio · Setor Universitário, Goiânia<');
    expect(ambos).toContain('>R$ 1.340 total/mês<');
    expect(ambos).toContain('>ou R$ 210.000 à venda<');
    expect(ambos).toContain(
      '<span>32 m²</span><span>1 quarto</span><span>mobiliado</span><span>aceita pet</span>',
    );
  });
});
