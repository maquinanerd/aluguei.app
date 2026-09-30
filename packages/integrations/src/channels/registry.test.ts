import { describe, expect, it } from 'vitest';
import { CHANNEL_TYPE_FEATURES, isChannelAvailable } from './registry.js';

/**
 * Onda 0 da rodada de fidelidade, defeito 16: o "Canal de teste" (`fake`) aparecia para qualquer
 * imobiliária como canal disponível, inclusive em produção. Ele só existe onde a configuração o
 * libera; os portais parceiros continuam indisponíveis enquanto não tiverem adapter (ADR-097).
 */
describe('isChannelAvailable', () => {
  it('o canal de teste só fica disponível quando a configuração libera', () => {
    expect(isChannelAvailable('fake', { allowFake: false })).toBe(false);
    expect(isChannelAvailable('fake', { allowFake: true })).toBe(true);
  });

  it('portal parceiro sem adapter segue indisponível, com ou sem a liberação do fake', () => {
    for (const canal of ['canalpro', 'vivareal', 'zap', 'olx', 'imovelweb'] as const) {
      expect(CHANNEL_TYPE_FEATURES[canal].adapter).toBeNull();
      expect(isChannelAvailable(canal, { allowFake: true })).toBe(false);
      expect(isChannelAvailable(canal, { allowFake: false })).toBe(false);
    }
  });
});
