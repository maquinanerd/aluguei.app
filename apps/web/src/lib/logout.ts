export type LogoutResult = { ok: true } | { ok: false; message: string };

/**
 * Chama o logout do BFF e só considera a saída concluída quando a API confirma
 * (2xx) ou quando a sessão já não existe (401). Antes, "Sair" ignorava a
 * resposta e redirecionava mesmo com o logout recusado (400) — a sessão seguia
 * válida (P1-03, auditoria 2026-09-10).
 */
export async function requestLogout(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LogoutResult> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'POST', cache: 'no-store' });
  } catch {
    return { ok: false, message: 'Não foi possível sair: falha de conexão. Tente novamente.' };
  }
  if (res.ok || res.status === 401) {
    return { ok: true };
  }
  const data: unknown = await res.json().catch(() => null);
  const message =
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string'
      ? data.message
      : `Não foi possível sair (HTTP ${String(res.status)}). Tente novamente.`;
  return { ok: false, message };
}
