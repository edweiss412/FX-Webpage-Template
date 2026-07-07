// lib/admin/telemetryFilterHref.ts
//
// Single source of truth for building a telemetry-page URL from the current
// searchParams plus a patch. Shared by EventFilters (the control surface) and
// ActiveFilterChips (the removal surface) so both agree on: cursor is always
// dropped (every filter change returns to page 1), and a null/empty patch value
// removes the key.

export const BASE = "/admin/dev/telemetry";

export function buildFilterHref(
  current: URLSearchParams,
  patch: Record<string, string | null>,
): string {
  const next = new URLSearchParams(current);
  next.delete("cursorAt"); // every filter change returns to page 1
  next.delete("cursorId");
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}
