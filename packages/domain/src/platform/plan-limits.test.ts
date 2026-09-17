import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { assertWithinPlanLimit, planResourcesOverLimit } from './plan-limits.js';
import type { PlanLimits } from './plan-limits.js';

const limits: PlanLimits = { maxUsers: 3, maxProperties: 2, maxPublishedListings: null };

describe('limites do plano', () => {
  it('permite enquanto o uso fica abaixo do limite', () => {
    expect(() => {
      assertWithinPlanLimit(limits, 'properties', 1);
    }).not.toThrow();
    expect(() => {
      assertWithinPlanLimit(limits, 'users', 2);
    }).not.toThrow();
  });

  it('limite nulo é ilimitado', () => {
    expect(() => {
      assertWithinPlanLimit(limits, 'publishedListings', 1_000_000);
    }).not.toThrow();
  });

  it('no limite, ou acima dele depois de um rebaixamento, lança PLAN_LIMIT_REACHED com detalhes', () => {
    for (const current of [2, 5]) {
      let error: unknown;
      try {
        assertWithinPlanLimit(limits, 'properties', current);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('PLAN_LIMIT_REACHED');
      expect((error as DomainError).details).toEqual({ resource: 'properties', limit: 2, current });
      expect((error as DomainError).message).toContain('2');
    }
  });

  it('lista os recursos acima do limite para o admin', () => {
    expect(
      planResourcesOverLimit(limits, { users: 3, properties: 3, publishedListings: 50 }),
    ).toEqual(['properties']);
    expect(
      planResourcesOverLimit(limits, { users: 4, properties: 2, publishedListings: 0 }),
    ).toEqual(['users']);
    expect(
      planResourcesOverLimit(
        { maxUsers: null, maxProperties: null, maxPublishedListings: null },
        { users: 99, properties: 99, publishedListings: 99 },
      ),
    ).toEqual([]);
  });
});
