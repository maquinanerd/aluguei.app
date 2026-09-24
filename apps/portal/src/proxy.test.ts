import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

/**
 * Ciclo de vida da URL do anúncio (ADR-099). O status vive no proxy porque a
 * página do App Router só sabe responder 404; o portal precisa de **410** no
 * anúncio que saiu do ar e de **301** quando o endereço muda.
 */

function pedido(caminho: string): NextRequest {
  return new NextRequest(new Request(`http://localhost:3100${caminho}`));
}

function respostaDaApi(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proxy do anúncio', () => {
  it('anúncio no ar segue para a página', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respostaDaApi(200, { listing: {}, canonicalSlug: 'no-ar' }))),
    );
    const resposta = await proxy(pedido('/imovel/no-ar'));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('location')).toBeNull();
  });

  it('anúncio fora do ar responde 410, não 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respostaDaApi(410, { status: 'REMOVED' }))),
    );
    const resposta = await proxy(pedido('/imovel/saiu-do-ar'));
    expect(resposta.status).toBe(410);
  });

  it('endereço trocado responde 301 para o novo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respostaDaApi(301, { canonicalSlug: 'endereco-novo' }))),
    );
    const resposta = await proxy(pedido('/imovel/endereco-antigo'));
    expect(resposta.status).toBe(301);
    expect(resposta.headers.get('location')).toContain('/imovel/endereco-novo');
  });

  it('API fora do ar não vira 410: deixa a página tratar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('conexão recusada'))),
    );
    const resposta = await proxy(pedido('/imovel/qualquer'));
    expect(resposta.status).toBe(200);
  });

  it('caminho que não é de anúncio passa direto, sem consultar a API', async () => {
    const chamada = vi.fn(() => Promise.resolve(respostaDaApi(200, {})));
    vi.stubGlobal('fetch', chamada);
    const resposta = await proxy(pedido('/alugar/goiania-go'));
    expect(resposta.status).toBe(200);
    expect(chamada).not.toHaveBeenCalled();
  });
});
