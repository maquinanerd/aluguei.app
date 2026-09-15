/**
 * CONTROLE NEGATIVO (versionado só no commit de RED): o que o cadastro de
 * template (contract-templates/templates-client.tsx) mostra hoje — nenhuma
 * variável listada e o exemplo `{{nome_locatario}} aluga de
 * {{nome_proprietario}}…`, com placeholders que a geração não oferece.
 * Substituído pela implementação no commit de correção.
 */
export const TEMPLATE_VARIABLE_HINTS: ReadonlyArray<{ variable: string; description: string }> = [];

export const TEMPLATE_BODY_EXAMPLE = '{{nome_locatario}} aluga de {{nome_proprietario}}…';
