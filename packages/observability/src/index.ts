export { createLogger, loggerOptions } from './logger.js';
export type { CreateLoggerOptions } from './logger.js';
export { captureError, errorDetails, installProcessErrorHandlers } from './errors.js';
export type {
  CapturedErrorKind,
  CaptureContext,
  ErrorDetails,
  ErrorSink,
  ProcessErrorHandlerOptions,
} from './errors.js';
export { PII_CENSOR, redactPiiDeep, redactPiiText, redactUrl } from './pii.js';
export {
  activeSpan,
  annotateHttpRoute,
  InMemorySpanExporter,
  markSpanError,
  startTelemetry,
  tracesUrl,
  withSpan,
} from './telemetry.js';
export type { ReadableSpan, SpanExporter, Telemetry, TelemetryOptions } from './telemetry.js';
