import { describe, expect, it } from 'vitest';
import { assertSuitesWithinBedrooms } from './rooms.js';

describe('suítes e quartos (ADR-107)', () => {
  it('aceita suítes até o número de quartos, e qualquer um dos dois ausente', () => {
    expect(() => {
      assertSuitesWithinBedrooms(3, 3);
    }).not.toThrow();
    expect(() => {
      assertSuitesWithinBedrooms(3, 0);
    }).not.toThrow();
    expect(() => {
      assertSuitesWithinBedrooms(null, 2);
    }).not.toThrow();
    expect(() => {
      assertSuitesWithinBedrooms(2, null);
    }).not.toThrow();
  });

  it('recusa mais suítes que quartos', () => {
    expect(() => {
      assertSuitesWithinBedrooms(1, 2);
    }).toThrow('O número de suítes não pode passar o de quartos');
  });
});
