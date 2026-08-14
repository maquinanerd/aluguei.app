import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, Badge, cx, formatBRL, initials } from './index';
import { MoneyValue } from './components/MoneyValue';

describe('ui primitives', () => {
  it('cx combina classes e filtra falsy', () => {
    expect(cx('a', false, 'b', null, undefined, 'c')).toBe('a b c');
  });

  it('formatBRL formata centavos', () => {
    expect(formatBRL(123456)).toBe('R$\u00a01.234,56');
    expect(formatBRL(null)).toBe('—');
  });

  it('initials gera 2 iniciais', () => {
    expect(initials('João da Silva')).toBe('JS');
    expect(initials('Maria')).toBe('MA');
  });

  it('Button renderiza variante e loading', () => {
    const html = renderToStaticMarkup(<Button variant="brand">Salvar</Button>);
    expect(html).toContain('peg-btn--brand');
    expect(html).toContain('Salvar');
    const loading = renderToStaticMarkup(<Button loading>Salvar</Button>);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('disabled');
  });

  it('Badge renderiza tom', () => {
    const html = renderToStaticMarkup(<Badge tone="success">OK</Badge>);
    expect(html).toContain('peg-badge--success');
  });

  it('MoneyValue formata centavos', () => {
    const html = renderToStaticMarkup(<MoneyValue cents={1000} />);
    expect(html).toContain('R$\u00a010,00');
  });
});
