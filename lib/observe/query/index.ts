// lib/observe/query/index.ts — the ONLY sanctioned read entry point.
export { queryEvents, type QueryEventsResult } from "./events";
export { getCronHealth, type QueryCronHealthResult } from "./cronHealth";
export { queryAlerts } from "./alerts";
export { queryChangeLog } from "./changeLog";
export { queryStagedParses } from "./staged";
export { queryIngestFailures } from "./failures";
export { queryPublishedWarnings } from "./warnings";
export { querySyncLog } from "./syncLog";
export { queryDeferred } from "./deferred";
export { queryWatchChannels } from "./watch";
export { isUuid, clampLimit } from "./types";
export type {
  AlertFilters,
  AlertRow,
  QueryAlertsResult,
  ChangeLogFilters,
  ChangeRow,
  QueryChangeLogResult,
  StagedFilters,
  StagedRow,
  QueryStagedResult,
  FailureFilters,
  FailureRow,
  QueryFailuresResult,
  PublishedWarningsFilters,
  PublishedWarningsRow,
  QueryPublishedWarningsResult,
  SyncLogFilters,
  SyncLogRow,
  QuerySyncLogResult,
  DeferredFilters,
  DeferredRow,
  QueryDeferredResult,
  WatchFilters,
  WatchRow,
  QueryWatchResult,
} from "./types";
export {
  serializeParseWarning,
  serializeWarningArray,
  emitClassDCode,
  type SerializedWarning,
} from "./serializeWarning";
