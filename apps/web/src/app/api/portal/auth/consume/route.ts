import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiProxy, isSameOrigin } from '@/lib/api-server';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'FORBIDDEN', message: 'Origem inválida' },
      { status: 403 },
    );
  }
  const body: unknown = await request.json();
  return apiProxy('/portal/auth/consume', { method: 'POST', body: JSON.stringify(body) }, request);
}
