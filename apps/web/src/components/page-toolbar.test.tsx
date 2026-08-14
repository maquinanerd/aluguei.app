import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageToolbar } from './page-toolbar';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

describe('PageToolbar', () => {
  it('renderiza título, descrição e ações', () => {
    const html = renderToStaticMarkup(
      <PageToolbar title="Leads" description="Funil de captação" actions={<button type="button">Novo</button>} />,
    );
    expect(html).toContain('Leads');
    expect(html).toContain('Funil de captação');
    expect(html).toContain('Novo');
  });
});
