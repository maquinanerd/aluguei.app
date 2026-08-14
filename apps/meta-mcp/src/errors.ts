import { DomainError } from '@aluguei/domain';

/** Converte erros em mensagens de tool MCP (sem expor segredos). */
export function toToolError(err: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
} {
  const message = err instanceof Error ? err.message : String(err);
  const safe = message
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .replace(/EAAG[a-zA-Z0-9_-]+/g, '[token]')
    .slice(0, 500);
  return {
    content: [{ type: 'text', text: safe }],
    isError: true,
  };
}

/** Erro de validação de ferramenta (zod/DomainError INVALID_INPUT). */
export function invalidInput(message: string): DomainError {
  return new DomainError('INVALID_INPUT', message);
}

export function notFound(message: string): DomainError {
  return new DomainError('NOT_FOUND', message);
}
