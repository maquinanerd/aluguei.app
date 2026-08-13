export type ChannelType = 'fake' | 'canalpro' | 'vivareal' | 'zap' | 'olx' | 'imovelweb';
export type ChannelPublicationStatus =
  | 'PENDING'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'UPDATE_PENDING'
  | 'REMOVING'
  | 'REMOVED'
  | 'FAILED'
  | 'RECONCILING';
export type ChannelJobType = 'PUBLISH' | 'UPDATE' | 'REMOVE' | 'RECONCILE' | 'IMPORT_LEADS';

export interface ChannelListingInput {
  externalId: string;
  title: string;
  description: string | null;
  monthlyRentCents: number;
  publicAddress: {
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
  features: string[];
  media: Array<{ kind: 'PHOTO' | 'FLOORPLAN'; storageKey: string; mimeType: string | null }>;
}

export interface ChannelPublishResult {
  channelListingId: string;
  status: 'PUBLISHED';
  url?: string | null;
}

export interface ChannelRemoveResult {
  status: 'REMOVED';
}

export type ChannelUpdateResult = ChannelPublishResult;

export interface ChannelReconcileResult {
  channelListingId: string | null;
  status: 'PUBLISHED' | 'REMOVED' | 'NOT_FOUND' | 'PAUSED';
  url?: string | null;
}

export interface ChannelValidationResult {
  valid: boolean;
  errors: string[];
}

/** Lead importado do canal — referenceId (sem PII bruta) + contatos mínimos. */
export interface ChannelLeadInput {
  referenceId: string;
  channelListingId: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  receivedAt: string;
}

/**
 * Adapter conceitual de canal de distribuição. Cada portal pode usar REST,
 * XML/feed, SFTP ou webhook — a interface não assume transporte.
 * Contrato de idempotência: `channelListingId` é determinístico a partir de
 * (channel, externalId); remove de item inexistente resolve com sucesso.
 */
export interface IListingChannelAdapter {
  readonly channel: ChannelType;
  readonly supportsImportLeads: boolean;
  validate(input: ChannelListingInput): Promise<ChannelValidationResult>;
  publish(input: ChannelListingInput): Promise<ChannelPublishResult>;
  update(input: ChannelListingInput & { channelListingId: string }): Promise<ChannelUpdateResult>;
  remove(input: { channelListingId: string }): Promise<ChannelRemoveResult>;
  reconcile(input: { channelListingId: string | null }): Promise<ChannelReconcileResult>;
  importLeads?(input: { since?: string }): Promise<{ leads: ChannelLeadInput[] }>;
}
