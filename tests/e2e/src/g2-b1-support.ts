import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Apoio dos specs da Track B1 do Gate G2 (auditoria 2026-09-10). Contas criadas
 * direto na API (o cadastro não é o que estes specs verificam) e sessão
 * injetada no navegador; providers FAKE, nenhum efeito externo.
 */

export const API = `http://127.0.0.1:${process.env.API_PORT ?? '4000'}`;
export const WEB = `http://localhost:${process.env.WEB_PORT ?? '3000'}`;
export const DAY_MS = 86_400_000;

export interface ApiResult<T> {
  status: number;
  body: T;
  headers: Headers;
}

export async function api<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { json?: unknown; cookie?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (opts.cookie) {
    headers.cookie = opts.cookie;
  }
  const res = await fetch(API + path, {
    method,
    headers,
    ...(opts.json !== undefined ? { body: JSON.stringify(opts.json) } : {}),
  });
  const body = (await res.json().catch(() => null)) as T;
  return { status: res.status, body, headers: res.headers };
}

export function uniq(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface Account {
  email: string;
  password: string;
  cookie: string;
  orgId: string;
}

/** Admin da plataforma criado pela stack (mesmos valores de E2E_PLATFORM_ADMIN em scripts/stack.mjs). */
export const PLATFORM_ADMIN = {
  email: 'plataforma@e2e.aluguei.test',
  password: 'senha-segura-123',
};

let platformAdminCookie: string | null = null;

/** Sessão do admin da plataforma na API (login uma vez por processo de teste). */
export async function platformAdminSession(): Promise<string> {
  if (platformAdminCookie) return platformAdminCookie;
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(PLATFORM_ADMIN),
  });
  expect(res.status, 'login do admin da plataforma').toBe(200);
  platformAdminCookie = sessionCookie(res);
  return platformAdminCookie;
}

/** Aprova a imobiliária do cadastro aberto (cadastro nasce em análise). */
export async function approveOrganization(orgId: string): Promise<void> {
  const res = await api('POST', `/platform/organizations/${orgId}/approve`, {
    cookie: await platformAdminSession(),
    json: {},
  });
  expect(res.status, 'aprovação da imobiliária').toBe(200);
}

function sessionCookie(res: Response): string {
  const token = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .find((c) => c.startsWith('aluguei_session='));
  expect(token, 'a API deve devolver o cookie de sessão').toBeTruthy();
  return token ?? '';
}

/** Tentativas de cadastro: a primeira e uma depois de cada 429. */
const REGISTER_ATTEMPTS = 3;

/**
 * O cadastro tem limite por IP (10 por minuto) e a suíte inteira cadastra de um IP só. No 429 o
 * teste espera o `retry-after` que a API mandou, como um cliente correto, e ganha esse tempo a mais
 * de timeout; o limite continua valendo.
 */
export async function waitForRetryAfter(retryAfter: string | null): Promise<void> {
  const seconds = Number(retryAfter);
  const waitMs = (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000 + 1000;
  test.info().setTimeout(test.info().timeout + waitMs);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

/** Clica em "Criar conta" e repete depois do `retry-after` se o cadastro bater no limite. */
export async function submitRegistration(page: Page): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Criar conta' }).click();
    const res = await response;
    if (res.status() !== 429 || attempt === REGISTER_ATTEMPTS) {
      expect(res.status(), 'cadastro pela tela').toBe(201);
      return;
    }
    await waitForRetryAfter(res.headers()['retry-after'] ?? null);
  }
}

export async function registerViaApi(label: string): Promise<Account> {
  const id = uniq();
  const email = `b1-${label}-${id}@teste.com`;
  const password = 'e2e-password-123';
  let res: Response;
  for (let attempt = 1; ; attempt += 1) {
    res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Corretor ${label}`,
        email,
        password,
        organizationName: `Imob B1 ${label} ${id}`,
      }),
    });
    if (res.status !== 429 || attempt === REGISTER_ATTEMPTS) {
      break;
    }
    await waitForRetryAfter(res.headers.get('retry-after'));
  }
  expect(res.status, 'cadastro na API').toBe(201);
  const body = (await res.json()) as { org: { id: string } };
  // Estes specs não verificam o cadastro: a imobiliária é aprovada logo em seguida.
  await approveOrganization(body.org.id);
  return { email, password, cookie: sessionCookie(res), orgId: body.org.id };
}

export async function loginViaApi(account: Account): Promise<Account> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  expect(res.status, 'login na API').toBe(200);
  return { ...account, cookie: sessionCookie(res) };
}

/** Coloca a sessão da API no navegador (cookie httpOnly do domínio do web). */
export async function useSession(page: Page, cookie: string): Promise<void> {
  const value = cookie.slice('aluguei_session='.length);
  await page
    .context()
    .addCookies([{ name: 'aluguei_session', value, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
}

export async function createProperty(cookie: string, title: string): Promise<string> {
  const res = await api<{ property: { id: string } }>('POST', '/properties', {
    cookie,
    json: { title, propertyType: 'APARTMENT' },
  });
  expect(res.status, `criar imóvel "${title}"`).toBe(201);
  return res.body.property.id;
}

export async function poll<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  what: string,
  attempts = 45,
): Promise<T> {
  let last = await read();
  for (let i = 0; i < attempts && !done(last); i++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    last = await read();
  }
  expect(done(last), what).toBe(true);
  return last;
}

/** Respostas >= 400 do BFF e erros de página, marcados com a rota em que ocorreram. */
export function watchPage(page: Page): {
  route: string;
  backendFailures: string[];
  pageErrors: string[];
} {
  const state = { route: '', backendFailures: [] as string[], pageErrors: [] as string[] };
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/backend/') && res.status() >= 400) {
      state.backendFailures.push(
        `${state.route} → ${String(res.status())} ${res.request().method()} ${url.replace(WEB, '')}`,
      );
    }
  });
  page.on('pageerror', (err) => {
    state.pageErrors.push(`${state.route} → ${err.message}`);
  });
  return state;
}
