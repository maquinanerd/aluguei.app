import type {
  InspectionAggregate,
  InspectionSummary,
  LoginResponse,
  MeResponse,
  Observation,
  ObservationCategory,
  Property,
  ReviewData,
  Room,
  Severity,
  Visit,
} from './types';

/**
 * Cliente HTTP único do app mobile. Regras:
 * - Base URL de EXPO_PUBLIC_API_BASE_URL (default localhost:4000).
 * - Sessão: em RN o fetch não gerencia cookies. Capturamos `Set-Cookie`
 *   (aluguei_session=<token>) e reenviamos em toda chamada — como `Cookie` e
 *   como `Authorization: Bearer <token>` (ADR-005: mobile usa Bearer; a API
 *   aceita ambos, é o mesmo token).
 * - NUNCA logar o cookie/token (segredo de sessão).
 * - Erros viram ApiError tipado (status + code + message legível).
 */

const DEFAULT_BASE_URL = 'http://localhost:4000';

/**
 * Acesso tipado a variáveis EXPO_PUBLIC_*: o `process.env` do Expo é uma
 * interseção de index signatures (@types/node + expo/types) e o TS resolve
 * membros não declarados como `any`. Normalizamos na fronteira para
 * `string | undefined` — o valor real em runtime é sempre string ou ausente.
 */
function readPublicEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

const BASE_URL = readPublicEnv().EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL;

const SESSION_COOKIE_NAME = 'aluguei_session';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Token de sessão opaco (em memória, sem persistência nesta fase). */
let sessionToken: string | null = null;

export function hasSession(): boolean {
  return sessionToken !== null;
}

/** Limpa a sessão em memória (ex.: logout futuro). */
export function clearSession(): void {
  sessionToken = null;
}

function captureSessionToken(setCookieHeader: string | null): void {
  if (setCookieHeader === null) {
    return;
  }
  const pair = setCookieHeader.split(';')[0] ?? '';
  const equalIndex = pair.indexOf('=');
  if (equalIndex <= 0) {
    return;
  }
  const token = pair.slice(equalIndex + 1);
  if (token.length > 0) {
    sessionToken = token;
  }
}

function authHeaders(): Record<string, string> {
  if (sessionToken === null) {
    return {};
  }
  return {
    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
    authorization: `Bearer ${sessionToken}`,
  };
}

function readErrorMessage(data: unknown): string | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string'
  ) {
    return data.message;
  }
  return null;
}

function readErrorCode(data: unknown): string | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    typeof data.code === 'string'
  ) {
    return data.code;
  }
  return null;
}

/** Mensagem legível a partir de qualquer erro (ApiError, rede, inesperado). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Erro inesperado. Tente novamente.';
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  json?: unknown;
}

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...authHeaders(),
  };
  const jsonBody = options.json !== undefined ? JSON.stringify(options.json) : null;
  if (jsonBody !== null) {
    headers['content-type'] = 'application/json';
  }

  const init: RequestInit = { method, headers };
  if (jsonBody !== null) {
    init.body = jsonBody;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    // fetch lança TypeError de rede — mensagem explícita, sem PII.
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  }

  captureSessionToken(response.headers.get('set-cookie'));

  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      readErrorMessage(data) ?? `Falha na requisição (HTTP ${String(response.status)})`;
    throw new ApiError(response.status, message, readErrorCode(data));
  }
  return data as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>('/auth/login', { method: 'POST', json: { email, password } });
}

export function me(): Promise<MeResponse> {
  return api<MeResponse>('/auth/me');
}

/**
 * Visitas "abertas" (agenda). O contrato da API (packages/contracts) aceita
 * apenas SCHEDULED/CONFIRMED/DONE/CANCELLED/NO_SHOW — não existe `OPEN` no
 * schema de visits. Buscamos SCHEDULED + CONFIRMED e mesclamos por id.
 */
export async function listVisits(): Promise<Visit[]> {
  const [scheduled, confirmed] = await Promise.all([
    api<{ visits: Visit[] }>('/visits?limit=50&status=SCHEDULED'),
    api<{ visits: Visit[] }>('/visits?limit=50&status=CONFIRMED'),
  ]);
  const byId = new Map<string, Visit>();
  for (const visit of [...scheduled.visits, ...confirmed.visits]) {
    byId.set(visit.id, visit);
  }
  return [...byId.values()];
}

export async function getProperty(propertyId: string): Promise<Property> {
  const data = await api<{ property: Property }>(`/properties/${propertyId}`);
  return data.property;
}

export async function createInspection(
  propertyId: string,
  type: 'CHECKIN' | 'CHECKOUT',
): Promise<InspectionSummary> {
  const data = await api<{ inspection: InspectionSummary }>('/inspections', {
    method: 'POST',
    json: { propertyId, type },
  });
  return data.inspection;
}

export function getInspection(inspectionId: string): Promise<InspectionAggregate> {
  return api<InspectionAggregate>(`/inspections/${inspectionId}`);
}

export async function addRoom(inspectionId: string, name: string): Promise<Room> {
  const data = await api<{ room: Room }>(`/inspections/${inspectionId}/rooms`, {
    method: 'POST',
    json: { name },
  });
  return data.room;
}

export async function addObservation(
  inspectionId: string,
  input: {
    roomId?: string;
    category: ObservationCategory;
    severity: Severity;
    description: string;
  },
): Promise<Observation> {
  const body: {
    roomId?: string;
    category: ObservationCategory;
    severity: Severity;
    description: string;
  } = {
    category: input.category,
    severity: input.severity,
    description: input.description,
  };
  if (input.roomId !== undefined) {
    body.roomId = input.roomId;
  }
  const data = await api<{ observation: Observation }>(
    `/inspections/${inspectionId}/observations`,
    {
      method: 'POST',
      json: body,
    },
  );
  return data.observation;
}

export async function setInspectionStatus(
  inspectionId: string,
  status: 'CAPTURING' | 'COMPLETED',
): Promise<InspectionSummary> {
  const data = await api<{ inspection: InspectionSummary }>(`/inspections/${inspectionId}/status`, {
    method: 'PATCH',
    json: { status },
  });
  return data.inspection;
}

export async function processInspection(inspectionId: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/inspections/${inspectionId}/process`, { method: 'POST', json: {} });
}

export function getReview(inspectionId: string): Promise<ReviewData> {
  return api<ReviewData>(`/inspections/${inspectionId}/review`);
}
