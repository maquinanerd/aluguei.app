import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './MoneyInput';

const noop = (): void => undefined;

/**
 * Marcação do MoneyInput (P0-07). A digitação é coberta pelos testes do parser
 * (lib/money.test.ts) e, no navegador, por tests/e2e/src/g2-b1-money-input.spec.ts.
 */
describe('MoneyInput', () => {
  it('mostra os centavos no formato pt-BR e liga o rótulo ao campo', () => {
    const html = renderToStaticMarkup(
      <MoneyInput
        id="aluguel"
        label="Aluguel mensal (R$)"
        valueCents={350_050}
        onValueChange={noop}
      />,
    );
    expect(html).toContain('for="aluguel"');
    expect(html).toContain('Aluguel mensal (R$)');
    expect(html).toContain('id="aluguel"');
    expect(html).toContain('value="3.500,50"');
    expect(html).toMatch(/inputmode="decimal"/i);
    expect(html).toContain('aria-invalid="false"');
  });

  it('campo vazio usa o placeholder e não marca erro', () => {
    const html = renderToStaticMarkup(
      <MoneyInput
        id="caucao"
        label="Caução (R$)"
        optional
        valueCents={null}
        placeholder="3.500,00"
        onValueChange={noop}
      />,
    );
    expect(html).toContain('value=""');
    expect(html).toContain('placeholder="3.500,00"');
    expect(html).toContain('opcional');
    expect(html).not.toContain('role="alert"');
  });

  it('erro do formulário aparece como alerta ligado ao campo', () => {
    const html = renderToStaticMarkup(
      <MoneyInput
        id="aluguel"
        label="Aluguel mensal (R$)"
        valueCents={null}
        error="Aluguel mensal é obrigatório"
        onValueChange={noop}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Aluguel mensal é obrigatório');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="aluguel-message"');
    expect(html).toContain('peg-input--error');
  });

  it('o prefixo R$ é decorativo para leitores de tela', () => {
    const html = renderToStaticMarkup(<MoneyInput valueCents={100} onValueChange={noop} />);
    expect(html).toContain('<span class="peg-input__prefix" aria-hidden="true">R$</span>');
    expect(html).toContain('value="1,00"');
  });
});
