import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiProxy, isSameOrigin } from '@/lib/api-server';

/**
 * Cliente (inquilino ou proprietário) pede o próprio link de acesso. A API responde sempre igual,
 * com ou sem cadastro, para não virar verificador de "esta pessoa é cliente desta imobiliária".
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'FORBIDDEN', message: 'Origem inválida' },
      { status: 403 },
    );
  }
  const body: unknown = await request.json();
  return apiProxy(
    '/portal/auth/request-link',
    { method: 'POST', body: JSON.stringify(body) },
    request,
  );
}
