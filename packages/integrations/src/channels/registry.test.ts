import { describe, expect, it } from 'vitest';
import { CHANNEL_TYPE_FEATURES, isChannelAvailable, isFeedChannel } from './registry.js';

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

/**
 * ADR-107: o Grupo OLX é um feed só (ZAP, Viva Real e OLX conforme o plano), não quatro canais. Os
 * canais substituídos e o `olx` reservado para a API própria ficam fora da tela; o estágio diz o que
 * o produto pode afirmar — e nenhum canal real se diz validado sem conta real.
 */
describe('registry do Grupo OLX (ADR-107)', () => {
  it('grupoolx é FEED, aparece na tela e se declara implementado sem validação real', () => {
    expect(isFeedChannel('grupoolx')).toBe(true);
    expect(CHANNEL_TYPE_FEATURES.grupoolx).toMatchObject({
      mode: 'FEED',
      offered: true,
      stage: 'IMPLEMENTED_NOT_LIVE_VERIFIED',
      adapter: null,
    });
  });

  it('Canal Pro, Viva Real e ZAP ficam substituídos pelo grupoolx e fora da tela', () => {
    for (const canal of ['canalpro', 'vivareal', 'zap'] as const) {
      expect(CHANNEL_TYPE_FEATURES[canal].supersededBy).toBe('grupoolx');
      expect(CHANNEL_TYPE_FEATURES[canal].offered).toBe(false);
    }
  });

  it('a API própria da OLX é outra integração: reservada, fora da tela, em preparação', () => {
    expect(CHANNEL_TYPE_FEATURES.olx).toMatchObject({
      mode: 'PUSH',
      offered: false,
      stage: 'IN_PREPARATION',
    });
  });

  it('nenhum canal real se declara validado ao vivo', () => {
    for (const [canal, features] of Object.entries(CHANNEL_TYPE_FEATURES)) {
      expect(features.stage, canal).not.toBe('LIVE_VERIFIED');
    }
  });
});
