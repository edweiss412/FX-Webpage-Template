// lib/admin/bellValidation.ts
//
// Shared timestamp guard for the bell open/read write routes (spec §4, §12).
// Rejects anything that isn't a parseable ISO-ish string, and anything more
// than SKEW_MS ahead of the server clock (clock-skew defense — the write RPCs
// are greatest-wins monotonic, so a far-future stamp would permanently pin the
// watermark ahead of real activity). Normalizes to a canonical ISO string so
// the RPC always receives the same shape regardless of the client's input
// format.
const SKEW_MS = 60_000;

export function parseBellTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  if (ms > Date.now() + SKEW_MS) return null;
  return new Date(ms).toISOString();
}
