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
  return apiProxy('/portal/auth/logout', { method: 'POST' }, request);
}
