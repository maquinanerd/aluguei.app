import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Defeito 5 da Onda 0 (rodada de fidelidade): o extrato pedia só o primeiro imóvel
 * (`?propertyId=` do primeiro da lista), então o proprietário com dois imóveis via metade do que
 * tem a receber. Sem filtro, a API já soma todos os imóveis dele.
 */

const pedidos = vi.hoisted(() => [] as string[]);

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect ${destino}`);
  },
}));

vi.mock('@/lib/api-server', () => ({
  apiFetch: (caminho: string) => {
    pedidos.push(caminho);
    if (caminho === '/portal/me') {
      return Promise.resolve({
        partyId: 'pa-1',
        partyName: 'Marcos Tavares',
        kind: 'LANDLORD',
        orgId: 'o-1',
        orgName: 'Imobiliária Exemplo',
      });
    }
    if (caminho === '/portal/landlord/properties') {
      return Promise.resolve({
        properties: [
          { id: 'p-1', title: 'Apto 2 qts Setor Bueno', status: 'ACTIVE' },
          { id: 'p-2', title: 'Casa Jardim América', status: 'ACTIVE' },
        ],
      });
    }
    if (caminho.startsWith('/portal/landlord/statement')) {
      // Com filtro, só o primeiro imóvel (R$ 2.070); sem filtro, os dois (R$ 4.500).
      const soPrimeiro = caminho.includes('propertyId=p-1');
      return Promise.resolve({
        totals: {
          allocatedCents: soPrimeiro ? 207000 : 450000,
          paidOutCents: 0,
          pendingCents: soPrimeiro ? 207000 : 450000,
        },
        allocations: [],
      });
    }
    return Promise.reject(new Error(`rota inesperada ${caminho}`));
  },
}));

vi.mock('@/components/portal/portal-logout-button', () => ({
  PortalLogoutButton: () => null,
}));

import ProprietarioPage from './page';

describe('ProprietarioPage', () => {
  it('o extrato soma todos os imóveis do proprietário, não só o primeiro', async () => {
    const html = renderToStaticMarkup(await ProprietarioPage());
    expect(pedidos).toContain('/portal/landlord/statement');
    expect(pedidos.some((caminho) => caminho.includes('propertyId='))).toBe(false);
    expect(html).toContain('4.500,00');
  });
});
