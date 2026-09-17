import { describe, expect, it } from 'vitest';
import {
  buildContractVariables,
  CONTRACT_TEMPLATE_VARIABLES,
  renderTemplate,
} from '@aluguei/domain';
import { TEMPLATE_BODY_EXAMPLE, TEMPLATE_VARIABLE_HINTS } from './contract-template-hints';

/**
 * Cadastro de template diante das regras da trilha A do G2 (P2-08, ADR G2A-3):
 * a geração oferece `tenantName`, `landlordName`, `propertyTitle` e
 * `monthlyRent` (em R$); `monthlyRentCents` é só o nome legado. Placeholder sem
 * variável faz a geração responder 400 — o exemplo da tela usava
 * `{{nome_locatario}}`, que não existe.
 */
describe('variáveis sugeridas no cadastro de template', () => {
  it('toda variável sugerida existe na geração do contrato', () => {
    expect(TEMPLATE_VARIABLE_HINTS.length).toBeGreaterThan(0);
    for (const hint of TEMPLATE_VARIABLE_HINTS) {
      expect(CONTRACT_TEMPLATE_VARIABLES as readonly string[], hint.variable).toContain(
        hint.variable,
      );
      expect(hint.description.length, hint.variable).toBeGreaterThan(0);
    }
  });

  it('o aluguel é sugerido como {{monthlyRent}}, não pelo nome legado em centavos', () => {
    const variables = TEMPLATE_VARIABLE_HINTS.map((hint) => hint.variable);
    expect(variables).toContain('monthlyRent');
    expect(variables).not.toContain('monthlyRentCents');
  });

  it('o exemplo exibido gera um texto válido, com o aluguel em R$', () => {
    const text = renderTemplate(
      TEMPLATE_BODY_EXAMPLE,
      buildContractVariables({
        tenantName: 'Ana Souza',
        landlordName: 'Bruno Lima',
        propertyTitle: 'Apartamento Centro',
        monthlyRentCents: 250_000,
      }),
    );
    expect(text).toContain('Ana Souza');
    expect(text).toContain('R$ 2.500,00');
    expect(text).not.toContain('{{');
  });
});
