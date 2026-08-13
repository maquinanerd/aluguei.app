import type { NextRequest } from 'next/server';
import { apiProxy } from '@/lib/api-server';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body: unknown = await request.json();
  return apiProxy(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }, request);
}
