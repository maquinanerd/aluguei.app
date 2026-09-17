import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AsyncCombobox, nextActiveIndex } from './AsyncCombobox';

const noop = (): void => undefined;
const noOptions = () => Promise.resolve([]);

/**
 * Estrutura do combobox (P1-01). A busca e a seleção no navegador são cobertas
 * por tests/e2e/src/g2-b1-navigation.spec.ts ("os modais de criação oferecem o
 * imóvel da organização").
 */
describe('AsyncCombobox — marcação', () => {
  it('segue o padrão combobox + listbox, com a lista ligada ao campo', () => {
    const html = renderToStaticMarkup(
      <AsyncCombobox
        id="imovel"
        label="Imóvel"
        value={null}
        onChange={noop}
        loadOptions={noOptions}
      />,
    );
    expect(html).toContain('<label class="peg-field__label" for="imovel">Imóvel</label>');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="imovel-listbox"');
    expect(html).toContain('id="imovel-listbox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Opções de Imóvel"');
    expect(html).toContain('<div class="peg-combobox__popup" hidden="">');
    expect(html).not.toContain('Limpar Imóvel');
  });

  it('mostra a opção selecionada e oferece limpar', () => {
    const html = renderToStaticMarkup(
      <AsyncCombobox
        id="imovel"
        label="Imóvel"
        value={{ value: 'p-1', label: 'Apartamento Centro' }}
        onChange={noop}
        loadOptions={noOptions}
      />,
    );
    expect(html).toContain('value="Apartamento Centro"');
    expect(html).toContain('aria-label="Limpar Imóvel"');
  });

  it('desabilitado não oferece limpar', () => {
    const html = renderToStaticMarkup(
      <AsyncCombobox
        id="imovel"
        label="Imóvel"
        disabled
        value={{ value: 'p-1', label: 'Apartamento Centro' }}
        onChange={noop}
        loadOptions={noOptions}
      />,
    );
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Limpar Imóvel');
  });

  it('erro externo vira alerta ligado ao campo', () => {
    const html = renderToStaticMarkup(
      <AsyncCombobox
        id="imovel"
        label="Imóvel"
        value={null}
        error="Escolha o imóvel"
        onChange={noop}
        loadOptions={noOptions}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Escolha o imóvel');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="imovel-message"');
  });
});

describe('nextActiveIndex — navegação por teclado', () => {
  it.each([
    [-1, 'ArrowDown', 3, 0],
    [0, 'ArrowDown', 3, 1],
    [2, 'ArrowDown', 3, 0],
    [-1, 'ArrowUp', 3, 2],
    [0, 'ArrowUp', 3, 2],
    [2, 'ArrowUp', 3, 1],
    [1, 'Home', 3, 0],
    [1, 'End', 3, 2],
    [0, 'ArrowDown', 0, -1],
    [0, 'End', 0, -1],
  ] as const)('de %i com %s em %i opções → %i', (current, key, count, expected) => {
    expect(nextActiveIndex(current, key, count)).toBe(expected);
  });
});
