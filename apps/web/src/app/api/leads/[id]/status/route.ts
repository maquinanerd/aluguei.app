import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiProxy, isSameOrigin } from '@/lib/api-server';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'FORBIDDEN', message: 'Origem inválida' },
      { status: 403 },
    );
  }
  const { id } = await context.params;
  const body: unknown = await request.json();
  return apiProxy(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }, request);
}
