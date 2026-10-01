import { DomainError } from '../errors.js';

/**
 * Suíte é quarto com banheiro (ADR-107): o número de suítes não passa o de quartos. Sem quartos
 * informados, não há com o que comparar — a regra só vale quando os dois existem.
 */
export function assertSuitesWithinBedrooms(bedrooms: number | null, suites: number | null): void {
  if (bedrooms !== null && suites !== null && suites > bedrooms) {
    throw new DomainError('INVALID_INPUT', 'O número de suítes não pode passar o de quartos', {
      field: 'suites',
      bedrooms,
      suites,
    });
  }
}
