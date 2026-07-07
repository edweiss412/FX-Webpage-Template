// Shared numeric guard for telemetry RPC row validation (DRY across
// loadTelemetryStats + loadAlertSummary). A drifted/partial function shape must
// degrade to infra_error, never render NaN — so every count coerced via
// toCount(...) is required to be a finite, non-negative integer.
export const isNonNegInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0;

// Null-safe count coercion. PostgREST may serialize a bigint as a numeric
// string, so Number(...) is intended — BUT `Number(null)` is `0`, which would
// let a drifted function returning a NULL field silently pass isNonNegInt as 0.
// Map null/undefined to NaN so a missing field FAILS validation (→ infra_error)
// instead of masquerading as a real zero.
export const toCount = (v: unknown): number => (v == null ? NaN : Number(v));
