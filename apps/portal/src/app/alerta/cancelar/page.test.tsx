import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Defeito 8 da Onda 0 (rodada de fidelidade): a página cancelava o alerta ao renderizar o GET. Um
 * leitor de e-mail que pré-abre links (antivírus, prévia) cancelava o alerta sem a pessoa pedir.
 * Agora abrir o link só pergunta; quem cancela é o botão, por uma ação POST.
 */

const api = vi.hoisted(() => ({
  responderAlerta: vi.fn(),
  criarAlerta: vi.fn(),
  enviarContato: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  ...api,
  PortalApiError: class extends Error {},
}));

import AlertaCancelarPage from './page';

function pagina(query: Record<string, string>) {
  return AlertaCancelarPage({ searchParams: Promise.resolve(query) });
}

describe('/alerta/cancelar', () => {
  it('abrir o link não cancela nada: pergunta antes', async () => {
    const html = renderToStaticMarkup(await pagina({ token: 'tok-1' }));
    expect(api.responderAlerta).not.toHaveBeenCalled();
    expect(html).toContain('Cancelar este alerta?');
    expect(html).toContain('Cancelar alerta');
    expect(html).toContain('Manter');
  });

  it('sem token, diz que o link está incompleto e não oferece o botão', async () => {
    const html = renderToStaticMarkup(await pagina({}));
    expect(api.responderAlerta).not.toHaveBeenCalled();
    expect(html).toContain('link');
    expect(html).not.toContain('Cancelar alerta');
  });
});
