import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@aluguei/domain';
import { mapSerasaScoreResponse, SerasaScreeningProvider } from './serasa.js';

describe('SerasaScreeningProvider (BLOCKED_PROVIDER_CONTRACT)', () => {
  it('exige clientId e clientSecret na configuração', () => {
    expect(() => new SerasaScreeningProvider({ clientId: '', clientSecret: 's' })).toThrow(
      DomainError,
    );
    expect(() => new SerasaScreeningProvider({ clientId: 'c', clientSecret: '' })).toThrow(
      DomainError,
    );
    expect(() => new SerasaScreeningProvider({ clientId: 'c', clientSecret: 's' })).not.toThrow();
  });

  it('rejeita timeoutMs não positivo', () => {
    expect(
      () => new SerasaScreeningProvider({ clientId: 'c', clientSecret: 's', timeoutMs: 0 }),
    ).toThrow(/timeoutMs/);
    expect(
      () => new SerasaScreeningProvider({ clientId: 'c', clientSecret: 's', timeoutMs: -1 }),
    ).toThrow(/timeoutMs/);
  });

  it('lança "não documentado/sem contrato" e NUNCA chama a rede', async () => {
    const fetchImpl = vi.fn();
    const provider = new SerasaScreeningProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      baseUrl: 'https://endpoint-hipotetico.invalido',
      fetchImpl,
      timeoutMs: 5_000,
    });
    const err = await provider
      .requestCreditScreening({ cpf: '00000000000', purpose: 'RENTAL_APPLICATION' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe('PROVIDER_ERROR');
    expect((err as DomainError).message).toContain('não documentado');
    expect((err as DomainError).message).toContain('sem contrato');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('instruções apontam o caminho de desbloqueio sem vazar segredos', async () => {
    const provider = new SerasaScreeningProvider({
      clientId: 'client-id',
      clientSecret: 'segredo-super-secreto',
    });
    const err = await provider
      .requestCreditScreening({ cpf: '12345678901', purpose: 'RENTAL_APPLICATION' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    const details = (err as DomainError).details as {
      classification: string;
      instructions: string;
      needs: string[];
    };
    expect(details.classification).toBe('BLOCKED_PROVIDER_CONTRACT');
    expect(details.instructions).toContain('3003-7372');
    expect(details.instructions).toContain('homologa');
    expect(details.needs).toContain('contrato_comercial');
    expect(JSON.stringify(details)).not.toContain('segredo-super-secreto');
    expect(JSON.stringify(err)).not.toContain('segredo-super-secreto');
  });
});

describe('mapSerasaScoreResponse (schema baseado na doc pública: 0–1000)', () => {
  it('mapeia score válido para o formato do domínio', () => {
    const result = mapSerasaScoreResponse({ score: 700 });
    expect(result.score).toBe(700);
    expect(result.redFlags).toEqual([]);
    expect(result.summary.provider).toBe('serasa');
    expect(result.summary.score).toBe(700);
  });

  it('aceita os limites 0 e 1000', () => {
    expect(mapSerasaScoreResponse({ score: 0 }).score).toBe(0);
    expect(mapSerasaScoreResponse({ score: 1000 }).score).toBe(1000);
  });

  it('rejeita score fora da faixa, não inteiro, ou ausente', () => {
    expect(() => mapSerasaScoreResponse({ score: 1001 })).toThrow(DomainError);
    expect(() => mapSerasaScoreResponse({ score: -1 })).toThrow(DomainError);
    expect(() => mapSerasaScoreResponse({ score: 700.5 })).toThrow(DomainError);
    expect(() => mapSerasaScoreResponse({ score: '700' })).toThrow(DomainError);
    expect(() => mapSerasaScoreResponse({})).toThrow(DomainError);
  });
});
