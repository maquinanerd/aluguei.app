import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiProxy, isSameOrigin } from '@/lib/api-server';

/**
 * Inquilino gera o Pix de uma cobrança pelo portal. A sessão do portal vai no cookie, que o
 * `apiProxy` repassa; a API confere que a cobrança é da locação de quem pede.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'FORBIDDEN', message: 'Origem inválida' },
      { status: 403 },
    );
  }
  const { id } = await context.params;
  const body = await request.text().catch(() => '');
  return apiProxy(
    `/portal/tenant/charges/${encodeURIComponent(id)}/payment`,
    { method: 'POST', body: body.length > 0 ? body : '{}' },
    request,
  );
}
