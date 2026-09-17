import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchParties } from './lookup';

/**
 * Busca do combobox de pessoa (auditoria 2026-09-10, P1-17): a candidatura nova
 * escolhe o solicitante no servidor por trecho do nome, do e-mail ou dos dígitos
 * de CPF, CNPJ ou telefone, com limite literal aceito pela API.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

function stubParties(parties: Array<{ id: string; name: string; type: string }>) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ parties, total: parties.length }))),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('searchParties', () => {
  it('busca pelo texto digitado, sem espaços nas pontas, e devolve nome como rótulo', async () => {
    const fetchMock = stubParties([
      { id: 'p1', name: 'Maria Souza', type: 'PERSON' },
      { id: 'p2', name: 'Souza Imóveis Ltda', type: 'COMPANY' },
    ]);
    const options = await searchParties('  souza ', new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/backend/parties?limit=20&q=souza');
    expect(options).toEqual([
      { value: 'p1', label: 'Maria Souza' },
      { value: 'p2', label: 'Souza Imóveis Ltda', description: 'Empresa' },
    ]);
  });

  it('sem texto: lista as primeiras pessoas sem filtro', async () => {
    const fetchMock = stubParties([]);
    await searchParties('   ', new AbortController().signal);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/backend/parties?limit=20');
  });
});
