import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * CSP do painel e o upload direto (B29): sem a origem do storage no `connect-src`, o navegador
 * bloqueia o envio do arquivo antes de sair — foi o que o E2E de documentos mostrou.
 */

async function connectSrc(origem: string | undefined): Promise<string | undefined> {
  vi.resetModules();
  if (origem === undefined) {
    vi.stubEnv('STORAGE_PUBLIC_ORIGIN', '');
  } else {
    vi.stubEnv('STORAGE_PUBLIC_ORIGIN', origem);
  }
  const { default: config } = await import('../next.config');
  const regras = await config.headers?.();
  const csp = regras?.[0]?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
  return csp?.split('; ').find((diretiva) => diretiva.startsWith('connect-src'));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CSP do painel: connect-src', () => {
  it('sem storage configurado, só a própria origem', async () => {
    expect(await connectSrc(undefined)).toBe("connect-src 'self'");
  });

  it('com o storage, a origem dele — e só a origem', async () => {
    expect(await connectSrc('http://127.0.0.1:4000')).toBe(
      "connect-src 'self' http://127.0.0.1:4000",
    );
    expect(await connectSrc('https://conta.r2.cloudflarestorage.com/bucket/caminho?x=1')).toBe(
      "connect-src 'self' https://conta.r2.cloudflarestorage.com",
    );
  });

  it('valor que não é URL http(s) não entra no cabeçalho', async () => {
    for (const valor of ["* 'unsafe-inline'", 'javascript:alert(1)', 'ftp://arquivos']) {
      expect(await connectSrc(valor)).toBe("connect-src 'self'");
    }
  });
});
