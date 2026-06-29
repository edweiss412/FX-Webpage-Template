// lib/log/index.ts
export { log, setLogSink, resetLogSink } from "./logger";
export { serializeError } from "./serializeError";
export { redactEmails, sanitizeContext } from "./sanitize";
export {
  deriveRequestId,
  getRequestContext,
  runWithRequestContext,
  setRequestShowId,
} from "./requestContext";
export type { LogFields, LogLevel, LogRecord, Sink } from "./types";
export type { RequestContext } from "./requestContext";
