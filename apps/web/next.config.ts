import type { NextConfig } from 'next';

/**
 * Upload direto (URL pré-assinada): o navegador manda o arquivo ao storage sem passar pela API, e
 * com `connect-src 'self'` a CSP bloquearia o envio antes de sair (B29). A origem vem de
 * STORAGE_PUBLIC_ORIGIN — na stack de E2E, a API com o storage em disco; em produção, o R2, no
 * build do web. Só a origem http(s) entra no cabeçalho; qualquer outro valor é ignorado.
 */
function origemDoStorage(): string | null {
  const valor = process.env.STORAGE_PUBLIC_ORIGIN?.trim();
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

const storage = origemDoStorage();

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      storage === null ? "connect-src 'self'" : `connect-src 'self' ${storage}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
