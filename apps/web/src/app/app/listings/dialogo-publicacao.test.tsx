import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Defeito 10 da Onda 0 (rodada de fidelidade): o diálogo dizia "vai publicar" em cada canal
 * disponível, "Publicar em N canais" no botão e "iguais em todos os canais conectados" — mas
 * confirmar só muda o status do anúncio, que é o que o põe no portal AchouImóvel. Publicar num
 * canal é outra ação, na tela de Canais. O diálogo tem de dizer o que o botão faz.
 */

vi.mock('@/lib/use-query', () => ({
  useQuery: () => ({
    loading: false,
    data: {
      canPublish: true,
      blockers: [],
      channels: [
        { channel: 'fake', available: true, status: null },
        { channel: 'olx', available: false, status: null },
      ],
    },
  }),
}));

import { DialogoPublicacao } from './dialogo-publicacao';

function dialogo() {
  return renderToStaticMarkup(
    <DialogoPublicacao
      listingId="l-1"
      titulo="Kitnet 32 m² · Setor Universitário"
      ocupado={false}
      etapa="publicar"
      aoFechar={() => undefined}
      aoPublicar={() => undefined}
      aoResolver={() => undefined}
    />,
  );
}

describe('DialogoPublicacao', () => {
  it('diz que confirmar publica no AchouImóvel, e só nele', () => {
    const html = dialogo();
    expect(html).toContain('AchouImóvel');
    expect(html).toContain('Publicar no AchouImóvel');
    expect(html.match(/vai publicar/g)).toHaveLength(1);
  });

  it('não promete publicação nem sincronia nos outros canais', () => {
    const html = dialogo();
    expect(html).not.toMatch(/Publicar em \d+ canais?/);
    expect(html).not.toContain('canais conectados');
    expect(html).toContain('tela de Canais');
  });
});
