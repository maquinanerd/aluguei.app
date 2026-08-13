import { FakeChannel } from './fake.js';
import type { ChannelType, IListingChannelAdapter } from './types.js';

/**
 * Registry de canais: `fake` tem adapter de referência; canais reais ficam
 * registrados SEM adapter (nenhum endpoint de portal é inventado — regra
 * docs/INTEGRATIONS.md). Rotas respondem 404 "canal não configurado".
 */
export const CHANNEL_TYPE_FEATURES: Record<
  ChannelType,
  { supportsImportLeads: boolean; adapter: 'fake' | null }
> = {
  fake: { supportsImportLeads: true, adapter: 'fake' },
  canalpro: { supportsImportLeads: false, adapter: null },
  vivareal: { supportsImportLeads: false, adapter: null },
  zap: { supportsImportLeads: false, adapter: null },
  olx: { supportsImportLeads: false, adapter: null },
  imovelweb: { supportsImportLeads: false, adapter: null },
};

export function getChannelAdapter(
  channel: ChannelType,
  overrides?: { fake?: FakeChannel },
): IListingChannelAdapter | null {
  const features = CHANNEL_TYPE_FEATURES[channel];
  if (features.adapter === 'fake') {
    return overrides?.fake ?? new FakeChannel();
  }
  return null;
}
