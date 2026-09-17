import { describe, expect, it } from 'vitest';
import { channelSelectOptions } from './channel-publish';

/**
 * Primeira publicação de um anúncio em canal pela tela (auditoria 2026-09-10,
 * P1-17): a tela só publicava de novo o que já estava em algum canal. Canal sem
 * integração configurada aparece desabilitado — a API responderia erro.
 */
describe('publicar anúncio em canal — opções de canal', () => {
  it('canal com integração fica disponível; sem integração aparece desabilitado', () => {
    expect(
      channelSelectOptions([
        { channel: 'fake', available: true },
        { channel: 'olx', available: false },
      ]),
    ).toEqual([
      { value: 'fake', label: 'Canal de teste' },
      { value: 'olx', label: 'OLX (sem integração)', disabled: true },
    ]);
  });

  it('canal sem rótulo conhecido mostra o código', () => {
    expect(channelSelectOptions([{ channel: 'novo', available: true }])).toEqual([
      { value: 'novo', label: 'novo' },
    ]);
  });
});
