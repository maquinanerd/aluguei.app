import { FakeChannel } from './fake.js';
import type {
  ChannelMode,
  ChannelType,
  IListingChannelAdapter,
  IntegrationStage,
} from './types.js';

export interface ChannelFeatures {
  supportsImportLeads: boolean;
  /** Adapter de chamada ao portal (modo PUSH). Feed não tem: quem busca é o portal. */
  adapter: 'fake' | null;
  /** Nulo quando o modo ainda não está definido por documentação oficial. */
  mode: ChannelMode | null;
  /** Aparece na tela. Canal substituído ou reservado fica de fora. */
  offered: boolean;
  /** O que o produto pode afirmar sobre o canal (ADR-097): nunca "conectado" sem conta real. */
  stage: IntegrationStage;
  supersededBy?: ChannelType;
}

/**
 * Registry de canais. `fake` tem adapter de referência; `grupoolx` é o feed VRSync do Grupo OLX
 * (ADR-107) — implementado e testado, sem validação com conta real. Os demais ficam registrados SEM
 * adapter (nenhum endpoint de portal é inventado — regra docs/INTEGRATIONS.md) e as rotas respondem
 * 404 "canal não configurado". `canalpro`, `vivareal` e `zap` foram substituídos por `grupoolx`
 * (o mesmo feed vale para os três portais) e `olx` fica reservado para a API própria da OLX.
 */
export const CHANNEL_TYPE_FEATURES: Record<ChannelType, ChannelFeatures> = {
  fake: {
    supportsImportLeads: true,
    adapter: 'fake',
    mode: 'PUSH',
    offered: true,
    stage: 'TEST_ONLY',
  },
  canalpro: {
    supportsImportLeads: false,
    adapter: null,
    mode: null,
    offered: false,
    stage: 'IN_PREPARATION',
    supersededBy: 'grupoolx',
  },
  vivareal: {
    supportsImportLeads: false,
    adapter: null,
    mode: null,
    offered: false,
    stage: 'IN_PREPARATION',
    supersededBy: 'grupoolx',
  },
  zap: {
    supportsImportLeads: false,
    adapter: null,
    mode: null,
    offered: false,
    stage: 'IN_PREPARATION',
    supersededBy: 'grupoolx',
  },
  olx: {
    supportsImportLeads: false,
    adapter: null,
    mode: 'PUSH',
    offered: false,
    stage: 'IN_PREPARATION',
  },
  imovelweb: {
    supportsImportLeads: false,
    adapter: null,
    mode: null,
    offered: true,
    stage: 'IN_PREPARATION',
  },
  grupoolx: {
    supportsImportLeads: false,
    adapter: null,
    mode: 'FEED',
    offered: true,
    stage: 'IMPLEMENTED_NOT_LIVE_VERIFIED',
  },
};

export function channelFeatures(channel: ChannelType): ChannelFeatures {
  return CHANNEL_TYPE_FEATURES[channel];
}

export function isFeedChannel(channel: ChannelType): boolean {
  return CHANNEL_TYPE_FEATURES[channel].mode === 'FEED';
}

/**
 * Canal que pode receber publicação agora. O `fake` só existe onde a configuração o libera
 * (`ALLOW_FAKE_CHANNEL=true`: desenvolvimento, testes e E2E) — em produção ele aparecia para
 * qualquer imobiliária como canal disponível (Onda 0 da rodada de fidelidade, defeito 16).
 * Portal parceiro sem adapter segue indisponível (ADR-097).
 */
export function isChannelAvailable(
  channel: ChannelType,
  options: { allowFake: boolean; overrides?: { fake?: FakeChannel } },
): boolean {
  if (channel === 'fake' && !options.allowFake) {
    return false;
  }
  return getChannelAdapter(channel, options.overrides) !== null;
}

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
