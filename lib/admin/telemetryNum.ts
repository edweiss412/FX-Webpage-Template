// Shared numeric guard for telemetry RPC row validation (DRY across
// loadTelemetryStats + loadAlertSummary). A drifted/partial function shape must
// degrade to infra_error, never render NaN — so every count coerced via
// Number(...) is required to be a finite, non-negative integer.
export const isNonNegInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
