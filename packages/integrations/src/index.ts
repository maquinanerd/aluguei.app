export { createRedisClient } from './redis/adapter.js';
export type { RedisAdapter } from './redis/adapter.js';
export { GoogleMapsGeocodingAdapter } from './geocoding/google.js';
export type { GoogleMapsGeocodingOptions } from './geocoding/google.js';
export { GeocodingMockService } from './geocoding/mock.js';
export type { GeocodingService, GeocodeInput, GeocodeResult } from './geocoding/types.js';
export { FakeChannel } from './channels/fake.js';
export { CHANNEL_TYPE_FEATURES, getChannelAdapter } from './channels/registry.js';
export type {
  IListingChannelAdapter,
  ChannelType,
  ChannelPublicationStatus,
  ChannelJobType,
  ChannelListingInput,
  ChannelPublishResult,
  ChannelRemoveResult,
  ChannelUpdateResult,
  ChannelReconcileResult,
  ChannelValidationResult,
  ChannelLeadInput,
} from './channels/types.js';
