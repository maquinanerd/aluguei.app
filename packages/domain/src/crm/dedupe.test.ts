import { describe, expect, it } from 'vitest';
import { findDedupeMatches } from './dedupe.js';

describe('findDedupeMatches', () => {
  const existing = [
    { partyId: 'p1', partyName: 'João Silva', kind: 'CPF' as const, value: '12345678901' },
    { partyId: 'p1', partyName: 'João Silva', kind: 'EMAIL' as const, value: 'joao@example.com' },
    { partyId: 'p2', partyName: 'Maria Souza', kind: 'CPF' as const, value: '98765432100' },
  ];

  it('encontra match por CPF e acumula razões', () => {
    const matches = findDedupeMatches([{ kind: 'CPF', value: '12345678901' }], existing);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ partyId: 'p1', name: 'João Silva', reasons: ['CPF'] });
  });

  it('acumula múltiplas razões do mesmo party', () => {
    const matches = findDedupeMatches(
      [
        { kind: 'CPF', value: '12345678901' },
        { kind: 'EMAIL', value: 'joao@example.com' },
      ],
      existing,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toEqual(['CPF', 'EMAIL']);
  });

  it('não retorna match sem identidade coincidente', () => {
    const matches = findDedupeMatches([{ kind: 'PHONE', value: '11999990000' }], existing);
    expect(matches).toHaveLength(0);
  });

  it('não casa kinds diferentes com o mesmo valor (falso positivo)', () => {
    const matches = findDedupeMatches(
      [{ kind: 'CPF', value: '12345678901' }],
      [{ partyId: 'p9', partyName: 'Telefone', kind: 'PHONE', value: '12345678901' }],
    );
    expect(matches).toHaveLength(0);
  });
});
