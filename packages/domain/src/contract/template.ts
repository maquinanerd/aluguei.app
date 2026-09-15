import { DomainError } from '../errors.js';

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Renderiza template com variáveis (placeholders `{{var}}`).
 * Falha se o template usar variável não fornecida: nunca gera documento com
 * buraco e um placeholder digitado errado não passa em silêncio. Variável
 * oferecida e não usada não é erro — a geração oferece o conjunto completo e
 * cada template usa o que precisa (auditoria 2026-09-10, P2-08).
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null>,
): string {
  return template.replace(PLACEHOLDER_RE, (_match, rawKey: string) => {
    const key = rawKey.trim();
    // hasOwn: `{{constructor}}` não pode resolver para o protótipo do objeto.
    if (!Object.hasOwn(variables, key)) {
      throw new DomainError('INVALID_INPUT', `Variável do template não fornecida: ${key}`);
    }
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });
}
