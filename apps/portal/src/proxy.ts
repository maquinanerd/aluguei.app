import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Ciclo de vida da URL do anúncio (ADR-099). O App Router só sabe responder 404
 * (`notFound()`) de dentro da página, e o portal precisa de **410** no anúncio
 * que saiu do ar: o buscador tira do índice mais rápido e para de revisitar.
 *
 * Por isso a decisão de status vive aqui, antes da renderização. Custa uma
 * chamada curta à API por acesso a `/imovel/*` — o corpo da resposta é
 * descartado, só o status importa.
 */

const ANUNCIO = /^\/imovel\/([^/]+)\/?$/;

export const config = {
  matcher: ['/imovel/:slug*'],
};

function apiBase(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:4000';
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const encontrado = ANUNCIO.exec(request.nextUrl.pathname);
  const slug = encontrado?.[1];
  if (slug === undefined) {
    return NextResponse.next();
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${apiBase()}/public/listings/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    // API fora do ar não vira 410: deixa a página tratar o erro.
    return NextResponse.next();
  }

  if (resposta.status === 301) {
    const corpo = (await resposta.json().catch(() => null)) as { canonicalSlug?: string } | null;
    const destino = corpo?.canonicalSlug;
    if (destino !== undefined && destino !== slug) {
      // Endereço antigo de um anúncio que continua no ar: 301 para o de hoje.
      return NextResponse.redirect(new URL(`/imovel/${destino}`, request.url), 301);
    }
    return NextResponse.next();
  }

  if (resposta.status === 410) {
    // A página continua sendo renderizada (com os imóveis parecidos), mas a
    // resposta sai como 410.
    return NextResponse.rewrite(request.nextUrl, { status: 410 });
  }

  return NextResponse.next();
}

export default proxy;
