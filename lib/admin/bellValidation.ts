// lib/admin/bellValidation.ts
//
// Shared timestamp guard for the bell open/read write routes (spec §4, §12).
// Accepts ONLY a strict ISO-8601 UTC/offset instant — the exact shape the
// client emits via `Date.prototype.toISOString()` (`…Z`), plus an explicit
// numeric offset (`+HH:MM`/`-HH:MM`) for tolerance. Bare `Date.parse` would
// also swallow locale-ish strings ("7/5/2026") and date-only values
// ("2026-07-05"), so the regex fences those out BEFORE parsing. Anything more
// than SKEW_MS ahead of the server clock is rejected too (clock-skew defense —
// the write RPCs are greatest-wins monotonic, so a far-future stamp would
// permanently pin the watermark ahead of real activity). Normalizes to a
// canonical ISO string so the RPC always receives the same shape.
const SKEW_MS = 60_000;

// YYYY-MM-DDTHH:MM:SS(.fraction)?(Z | ±HH:MM). Seconds are required (Date's
// toISOString always emits them); the fractional part is 1-6 digits.
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export function parseBellTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!ISO_INSTANT_RE.test(value)) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  if (ms > Date.now() + SKEW_MS) return null;
  return new Date(ms).toISOString();
}
