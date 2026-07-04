// lib/observe/query/types.ts
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

export type AlertFilters = { openOnly?: boolean; code?: string; limit?: number };
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
