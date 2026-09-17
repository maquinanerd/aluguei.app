import { describe, expect, it, vi } from 'vitest';
import { requestLogout } from './logout';

/**
 * P1-03 (auditoria 2026-09-10): "Sair" ignorava a resposta do logout e mandava
 * para /login mesmo quando a API recusava (400) — a sessão continuava válida.
 * O logout só conta como concluído com 2xx, ou 401 (sessão que já não existe);
 * qualquer outra resposta vira erro visível.
 */
describe('requestLogout', () => {
  it('2xx encerra a sessão', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(Response.json({ ok: true })));
    await expect(requestLogout('/api/auth/logout', fetchImpl)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
    });
  });

  it('401 (sessão já inexistente) conta como saída concluída', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.json({ message: 'Autenticação necessária' }, { status: 401 })),
    );
    await expect(requestLogout('/api/portal/auth/logout', fetchImpl)).resolves.toEqual({
      ok: true,
    });
  });

  it('400 não finge logout: devolve o erro da API', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { code: 'FST_ERR_CTP_EMPTY_JSON_BODY', message: 'Body cannot be empty' },
          { status: 400 },
        ),
      ),
    );
    await expect(requestLogout('/api/auth/logout', fetchImpl)).resolves.toEqual({
      ok: false,
      message: 'Body cannot be empty',
    });
  });

  it('500 sem corpo JSON devolve mensagem com o status', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('falhou', { status: 500 })));
    await expect(requestLogout('/api/auth/logout', fetchImpl)).resolves.toEqual({
      ok: false,
      message: 'Não foi possível sair (HTTP 500). Tente novamente.',
    });
  });

  it('falha de rede devolve erro sem redirecionar', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(requestLogout('/api/auth/logout', fetchImpl)).resolves.toEqual({
      ok: false,
      message: 'Não foi possível sair: falha de conexão. Tente novamente.',
    });
  });
});
