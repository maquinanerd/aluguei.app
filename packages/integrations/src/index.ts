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

export { MockAiProvider } from './ai/mock.js';
export { getAiProvider } from './ai/registry.js';
export type { AiRegistryOptions } from './ai/registry.js';
export type { AiProvider, IntentExtraction, IntentKind } from './ai/types.js';

export { FakeWhatsAppMessenger } from './whatsapp/fake.js';
export { MetaWhatsAppAdapter } from './whatsapp/meta.js';
export type { MetaWhatsAppAdapterOptions } from './whatsapp/meta.js';
export { getWhatsAppMessenger } from './whatsapp/registry.js';
export type { WhatsAppRegistryOptions } from './whatsapp/registry.js';

export { MockInspectionAiProvider } from './inspection-ai/mock.js';
export { getInspectionAiProvider } from './inspection-ai/registry.js';
export type {
  InspectionAiProvider,
  InspectionMediaKind,
  ObservationCategory,
  ObservationSuggestion,
  Severity,
  TranscribeResult,
} from './inspection-ai/types.js';

export { FakeScreeningProvider } from './screening/fake.js';
export { getScreeningProvider } from './screening/registry.js';
export type {
  IScreeningProvider,
  CreditScreeningInput,
  ScreeningProviderResult,
  RedFlag as ScreeningRedFlag,
} from './screening/types.js';

export { FakeSignatureProvider } from './signature/fake.js';
export { getSignatureProvider } from './signature/registry.js';
export type {
  ISignatureProvider,
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  EnvelopeParty,
  EnvelopeStatus,
} from './signature/types.js';

export { FakePaymentProvider } from './payments/fake.js';
export { getPaymentProvider } from './payments/registry.js';
export type { PaymentRegistryOptions } from './payments/registry.js';
export type {
  IPaymentProvider,
  CreateChargeInput,
  CreateChargeResult,
  PaymentChargeStatus,
} from './payments/types.js';
export type {
  WhatsAppMessenger,
  WebhookMessageEvent,
  SendTextResult,
  VerifyWebhookParams,
  VerifyWebhookResult,
} from './whatsapp/types.js';
