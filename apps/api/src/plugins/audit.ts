import type { DbExecutor } from '@aluguei/db';
import { auditEvents } from '@aluguei/db';
import { redactPiiText } from '@aluguei/observability';

/** Campos que a trilha registra como alterados sem guardar o valor (dado pessoal). */
const PERSONAL_FIELDS = [
  'name',
  'legalName',
  'email',
  'phone',
  'document',
  'documentNumber',
  'cpf',
  'cnpj',
  'birthDate',
  'waContactId',
  'ip',
  'userAgent',
  'password',
  'passwordHash',
];

/** Carimbos e identificadores: mudam sempre (ou nunca) e só fariam ruído no diff. */
const IGNORED_FIELDS = ['id', 'orgId', 'createdAt', 'updatedAt'];

/** Texto acima disso é cortado: o payload é trilha, não cópia do registro. */
const MAX_TEXT = 200;

export interface AuditDiffOptions {
  /** Campos pessoais além dos conhecidos. */
  personal?: readonly string[];
  /** Campos ignorados além de id, orgId, createdAt e updatedAt. */
  ignore?: readonly string[];
}

export interface AuditFieldChange {
  from: unknown;
  to: unknown;
}

export interface AuditDiff {
  /** Campos alterados, em ordem alfabética. */
  fields: string[];
  changes: Record<string, AuditFieldChange>;
}

/** Valor para comparar: sem redação (senão dois valores pessoais diferentes pareceriam iguais). */
function comparable(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

/** Valor para gravar: texto redigido e cortado; objeto e lista pela serialização. */
function forPayload(value: unknown): unknown {
  const base = comparable(value);
  if (typeof base === 'string') {
    const redacted = redactPiiText(base);
    return redacted.length > MAX_TEXT ? redacted.slice(0, MAX_TEXT) : redacted;
  }
  if (base !== null && typeof base === 'object') {
    return JSON.parse(redactPiiText(JSON.stringify(base))) as unknown;
  }
  return base;
}

/**
 * Diff dos campos alterados para `audit_events.payload` (auditoria 2026-09-10, P2-11: o payload
 * chegava vazio). Compara só o que veio em `after` (o corpo da atualização), pelo conteúdo;
 * campo pessoal fica marcado como `[REDACTED]` e texto livre passa pela redação de CPF, e-mail
 * e telefone. Datas viram ISO e texto longo é cortado.
 */
export function auditDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  opts: AuditDiffOptions = {},
): AuditDiff {
  const personal = new Set([...PERSONAL_FIELDS, ...(opts.personal ?? [])]);
  const ignored = new Set([...IGNORED_FIELDS, ...(opts.ignore ?? [])]);
  const changes: Record<string, AuditFieldChange> = {};
  for (const key of Object.keys(after).sort()) {
    if (ignored.has(key)) {
      continue;
    }
    if (JSON.stringify(comparable(before[key])) === JSON.stringify(comparable(after[key]))) {
      continue;
    }
    changes[key] = personal.has(key)
      ? { from: '[REDACTED]', to: '[REDACTED]' }
      : { from: forPayload(before[key]), to: forPayload(after[key]) };
  }
  return { fields: Object.keys(changes), changes };
}

export interface AuditInput {
  orgId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  /** Qualquer objeto (inclusive o `AuditDiff`); as chaves de segredo saem redigidas. */
  payload?: object;
}

/**
 * Grava audit event com payload redactada de PII antes do jsonb. Aceita `tx`
 * para que o registro faça parte da mesma transação do efeito auditado.
 */
export async function writeAudit(db: DbExecutor, input: AuditInput): Promise<void> {
  const { orgId, actorUserId, action, entityType, entityId, payload } = input;

  // Redação preventiva: nunca persistir credenciais/segredos em audit.
  const safePayload = { ...(payload ?? {}) } as Record<string, unknown>;
  for (const key of Object.keys(safePayload)) {
    if (/password|token|secret|authorization|api_?key/i.test(key)) {
      safePayload[key] = '[REDACTED]';
    }
  }

  await db.insert(auditEvents).values({
    orgId: orgId ?? null,
    actorUserId: actorUserId ?? null,
    action,
    entityType,
    entityId,
    payload: safePayload,
  });
}
