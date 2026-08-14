import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('renderiza o título principal do marketing', () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain('O sistema operacional da locação imobiliária');
    expect(html).toContain('Começar grátis');
  });
});
