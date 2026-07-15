// lib/observe/query/types.ts
import type { SerializedAlertIdentity } from "@/lib/adminAlerts/identityTypes";
import type { SerializedWarning } from "./serializeWarning";

// Module-private UUID guard (telemetryTypes' UUID_RE is NOT exported).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// Clamp a limit to [1, 500] with a command-specific default.
export function clampLimit(n: number | undefined, def: number): number {
  if (n === undefined || Number.isNaN(n)) return def;
  return Math.max(1, Math.min(500, Math.trunc(n)));
}

export type AlertFilters = {
  openOnly?: boolean;
  code?: string;
  limit?: number;
  includePii?: boolean;
};
export type AlertRow = {
  id: string;
  showId: string | null;
  code: string;
  raisedAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  showTitle: string | null;
  showSlug: string | null;
  identity: SerializedAlertIdentity;
};
export type QueryAlertsResult =
  | { kind: "ok"; alerts: AlertRow[] }
  | { kind: "infra_error"; message: string };

export type ChangeLogFilters = { showId?: string; sinceHours?: number | null; limit?: number };
export type ChangeRow = {
  id: string;
  showId: string;
  driveFileId: string;
  occurredAt: string;
  source: string;
  changeKind: string;
  entityRef: string | null;
  summary: string;
  status: string;
};
export type QueryChangeLogResult =
  | { kind: "ok"; changes: ChangeRow[] }
  | { kind: "infra_error"; message: string };

export type StagedFilters = {
  sessionId?: string;
  driveFileId?: string;
  warningsOnly?: boolean;
  sinceHours?: number | null;
  limit?: number;
  includePii?: boolean;
};
export type StagedRow = {
  id: string;
  driveFileId: string;
  parsedAt: string;
  stagedModifiedTime: string;
  sourceKind: string;
  wizardSessionId: string | null;
  wizardApproved: boolean;
  warningSummary: string;
  lastFinalizeFailureCode: string;
  lastFinalizeFailureCodeUnrecognized: boolean;
  warnings: SerializedWarning[];
  wizardApprovedByEmail?: string | null;
};
export type QueryStagedResult =
  | { kind: "ok"; rows: StagedRow[] }
  | { kind: "infra_error"; message: string };

export type FailureFilters = {
  sessionId?: string;
  code?: string;
  sinceHours?: number | null;
  limit?: number;
  includePii?: boolean;
};
export type FailureRow = {
  id: string;
  driveFileId: string;
  driveFileName: string;
  firstSeenAt: string;
  lastAttemptAt: string;
  attemptCount: number;
  lastErrorCode: string;
  lastErrorCodeUnrecognized: boolean;
  lastErrorMessage: string;
  lastWarnings: SerializedWarning[];
  wizardSessionId: string | null;
};
export type QueryFailuresResult =
  | { kind: "ok"; rows: FailureRow[] }
  | { kind: "infra_error"; message: string };

export type PublishedWarningsFilters = {
  showId?: string;
  limit?: number;
  includePii?: boolean;
};
export type PublishedWarningsRow = {
  showId: string;
  showTitle: string | null;
  showSlug: string | null;
  warnings: SerializedWarning[];
};
export type QueryPublishedWarningsResult =
  | { kind: "ok"; rows: PublishedWarningsRow[] }
  | { kind: "infra_error"; message: string };
