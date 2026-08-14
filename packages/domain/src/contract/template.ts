import { DomainError } from '../errors.js';

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Renderiza template com variáveis (placeholders `{{var}}`).
 * Falha se faltar variável (nunca gera documento com buraco) ou se a
 * variável não for declarada (evita erro de digitação silencioso).
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null>,
): string {
  const declared = new Set<string>();
  const rendered = template.replace(PLACEHOLDER_RE, (match, rawKey: string) => {
    const key = rawKey.trim();
    declared.add(key);
    if (!(key in variables)) {
      throw new DomainError('INVALID_INPUT', `Variável do template não fornecida: ${key}`);
    }
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });

  const unused = Object.keys(variables).filter((key) => !declared.has(key));
  if (unused.length > 0) {
    throw new DomainError(
      'INVALID_INPUT',
      `Variáveis declaradas sem uso no template: ${unused.join(', ')}`,
    );
  }
  return rendered;
}
