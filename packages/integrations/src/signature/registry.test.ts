import { describe, expect, it } from 'vitest';
import { AutentiqueSignatureProvider } from './autentique.js';
import { ClicksignSignatureProvider } from './clicksign.js';
import { FakeSignatureProvider } from './fake.js';
import { getSignatureProvider } from './registry.js';

describe('getSignatureProvider', () => {
  it('AUTENTIQUE e CLICKSIGN convivem: SIGNATURE_PROVIDER escolhe o adapter', () => {
    const autentique = getSignatureProvider({ provider: 'AUTENTIQUE', token: 't' });
    const clicksign = getSignatureProvider({ provider: 'CLICKSIGN', token: 't' });
    expect(autentique).toBeInstanceOf(AutentiqueSignatureProvider);
    expect(clicksign).toBeInstanceOf(ClicksignSignatureProvider);
    expect(clicksign?.name).toBe('CLICKSIGN');
  });

  it('ambiente: sandbox sem valor; production só quando pedido', () => {
    expect(getSignatureProvider({ provider: 'CLICKSIGN', token: 't' })?.testOnly).toBe(true);
    expect(
      getSignatureProvider({ provider: 'CLICKSIGN', token: 't', environment: 'production' })
        ?.testOnly,
    ).toBe(false);
    expect(
      getSignatureProvider({ provider: 'AUTENTIQUE', token: 't', environment: 'production' })
        ?.testOnly,
    ).toBe(false);
  });

  it('provider real sem token é null; FAKE é o mock', () => {
    expect(getSignatureProvider({ provider: 'CLICKSIGN' })).toBeNull();
    expect(getSignatureProvider({ provider: 'AUTENTIQUE' })).toBeNull();
    expect(getSignatureProvider({ provider: 'FAKE' })).toBeInstanceOf(FakeSignatureProvider);
  });
});
