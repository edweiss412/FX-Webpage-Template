// Shared timestamp helpers for the changes feed. Extracted from
// readShowChangeFeed so the hold-shaping step (shapeHoldEntry.ts) and the
// change-log branch use ONE implementation; both branches sort on the same key.

// Render the timestamptz the read layer returns as a stable ISO-8601 string |
// null. postgres-rest returns timestamptz as an ISO-ish string; normalize it
// via Date so the feed-rendered token is the canonical ISO form Phase 6
// submits back as p_expected_base_modified_time (resolution #26 / PF40).
export function toIso(value: string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

// Build a FULL-PRECISION chronological sort key from a raw timestamptz string
// (P5-F5 microsecond-truncation class — the feed merge must NOT sort on the
// Date/toIso-truncated display value, which loses sub-millisecond precision so
// same-ms cross-source rows compare equal and the holds-before-logs build order
// floats an older hold ahead of a newer change). Key = millisecond instant
// (zero-padded, monotonic) + the 6-digit fractional-second micros, so lexical
// comparison is chronological even across rows that share a millisecond.
export function sortKeyFromRaw(value: string): string {
  const ms = new Date(value).getTime(); // millisecond instant (offset-agnostic)
  const msKey = String(ms).padStart(16, "0");
  // Extract the fractional seconds digits (microseconds) from the raw string;
  // pad to 6 so 0.12 < 0.123456. Absent fractional part → all zeros.
  const frac = /\.(\d+)/.exec(value)?.[1] ?? "";
  const microKey = frac.padEnd(6, "0").slice(0, 6);
  return `${msKey}.${microKey}`;
}
