import { describe, expect, it } from 'vitest';
import {
  FakeMetaAdsProvider,
  FakeWhatsAppMessenger,
  getMetaAdsProvider,
  getWhatsAppMessenger,
} from './index.js';

/**
 * P1-12 (auditoria 2026-09-10): WhatsApp e Meta Ads caíam no FAKE sempre que o modo não era
 * `live` — inclusive sem modo nenhum ou com um valor digitado errado. O FAKE só vale com
 * `dry_run` explícito; o resto é "não configurado" (null), nunca simulação silenciosa.
 */
describe('registries sem FAKE por omissão (P1-12)', () => {
  it.each([undefined, '', 'live ', 'dryrun', 'DRY_RUN'])('WhatsApp com modo %j → null', (mode) => {
    const opts = mode === undefined ? {} : { mode };
    expect(getWhatsAppMessenger(opts)).toBeNull();
  });

  it('WhatsApp em dry_run explícito → FAKE', () => {
    expect(getWhatsAppMessenger({ mode: 'dry_run' })).toBeInstanceOf(FakeWhatsAppMessenger);
  });

  it.each([undefined, '', 'dryrun', 'LIVE'])('Meta Ads com modo %j → null', (mode) => {
    const opts = mode === undefined ? {} : { mode };
    expect(getMetaAdsProvider(opts)).toBeNull();
  });

  it('Meta Ads em dry_run explícito → FAKE', () => {
    expect(getMetaAdsProvider({ mode: 'dry_run' })).toBeInstanceOf(FakeMetaAdsProvider);
  });
});
