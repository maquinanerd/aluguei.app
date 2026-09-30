import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Defeito 7 da Onda 0 (rodada de fidelidade): a página comparava o tipo da vistoria com
 * `'ENTRY'`, que não existe no contrato (`CHECKIN`, `CHECKOUT`, `INTERMEDIATE`) — toda vistoria
 * aparecia ao inquilino como "de saída", inclusive a de entrada.
 */

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect ${destino}`);
  },
}));

vi.mock('@/lib/api-server', () => ({
  apiFetch: (caminho: string) => {
    if (caminho === '/portal/me') {
      return Promise.resolve({
        partyId: 'pa-1',
        partyName: 'Fernanda Souza',
        kind: 'TENANT',
        orgId: 'o-1',
        orgName: 'Imobiliária Exemplo',
        paymentsProvider: 'FAKE',
      });
    }
    if (caminho.startsWith('/portal/tenant/charges')) return Promise.resolve({ charges: [] });
    if (caminho === '/portal/tenant/contracts') return Promise.resolve({ contracts: [] });
    if (caminho === '/portal/tenant/inspections') {
      const vistoria = (id: string, type: string) => ({
        id,
        type,
        status: 'COMPLETED',
        observations: [],
        mediaCounts: { photos: 0, audios: 0, videos: 0 },
        inspectedAt: null,
      });
      return Promise.resolve({
        inspections: [vistoria('i-1', 'CHECKIN'), vistoria('i-2', 'CHECKOUT')],
      });
    }
    if (caminho === '/portal/tenant/statement') {
      return Promise.resolve({ totals: { billedCents: 0, paidCents: 0, openCents: 0 } });
    }
    return Promise.reject(new Error(`rota inesperada ${caminho}`));
  },
}));

vi.mock('@/components/portal/portal-logout-button', () => ({
  PortalLogoutButton: () => null,
}));

vi.mock('./pagar-pix', () => ({
  PagarPix: () => null,
}));

import InquilinoPage from './page';

describe('InquilinoPage', () => {
  it('a vistoria de entrada aparece como de entrada, e a de saída como de saída', async () => {
    const html = renderToStaticMarkup(await InquilinoPage());
    expect(html.match(/Vistoria de entrada/g)).toHaveLength(1);
    expect(html.match(/Vistoria de saída/g)).toHaveLength(1);
  });
});
