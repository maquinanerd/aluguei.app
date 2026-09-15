/**
 * Variáveis que o cadastro de template sugere (P2-08, ADR G2A-3). Espelham
 * CONTRACT_TEMPLATE_VARIABLES de packages/domain/src/contract/variables.ts sem
 * importar o domínio no bundle do cliente; contract-template-hints.test.ts
 * confere com o domínio e renderiza o exemplo com renderTemplate.
 * `monthlyRentCents` não é sugerido: é o nome legado, mantido só por templates
 * já aprovados, e sai em R$ igual a `monthlyRent`.
 */
export const TEMPLATE_VARIABLE_HINTS: ReadonlyArray<{ variable: string; description: string }> = [
  { variable: 'tenantName', description: 'Nome do locatário' },
  { variable: 'landlordName', description: 'Nome do proprietário' },
  { variable: 'propertyTitle', description: 'Título do imóvel' },
  { variable: 'monthlyRent', description: 'Aluguel mensal em R$ (ex.: R$ 2.500,00)' },
];

export const TEMPLATE_BODY_EXAMPLE =
  '{{tenantName}} aluga de {{landlordName}} o imóvel {{propertyTitle}} pelo aluguel mensal de {{monthlyRent}}.';
