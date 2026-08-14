import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiProxy, isSameOrigin } from '@/lib/api-server';

/**
 * Proxy genérico do painel: repassa qualquer chamada client-side para a API
 * (mesma política de segurança dos proxies específicos: origem para POST/PUT/
 * PATCH/DELETE, cookie do browser, XFF preservado e Set-Cookie devolvido).
 * Cobre `/api/backend/<path da API>`.
 */
export async function GET(request: NextRequest) {
  return proxy(request);
}

export async function POST(request: NextRequest) {
  return proxy(request);
}

export async function PUT(request: NextRequest) {
  return proxy(request);
}

export async function PATCH(request: NextRequest) {
  return proxy(request);
}

export async function DELETE(request: NextRequest) {
  return proxy(request);
}

async function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.replace(/^\/api\/backend\//, '').split('/');
  const query = request.nextUrl.search; // preserva query string original
  const path = `/${segments.map((s) => decodeURIComponent(s)).join('/')}${query}`;

  const method = request.method;
  if (method !== 'GET' && !isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'FORBIDDEN', message: 'Origem inválida' },
      { status: 403 },
    );
  }

  const body = method !== 'GET' ? await request.text().catch(() => '') : undefined;
  const init: RequestInit = { method, headers: {} };
  if (body && body.length > 0) {
    init.body = body;
  }
  return apiProxy(path, init, request);
}
