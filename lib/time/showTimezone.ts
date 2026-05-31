// M12.2 Phase A Task 2 — the single show-timezone resolver (spec §3.1(a)).
//
// Before this extraction there were two duplicate, non-reusable show-tz
// implementations: an unexported `resolveTimezone` in packList.ts and an
// inline cast-and-read in buildRightNowContext.ts. Neither could be reused
// by the admin dashboard live compute. This is the one exported resolver;
// crew right-now, pack-list, and admin all call it so "today" is evaluated
// in the SAME show timezone everywhere — structural parity, not asserted.
//
// `venue.timezone` does not exist on ShowRow.venue yet (no row populates
// it), so today this returns America/New_York for every show — behavior-
// preserving for the crew/packList suites. The IANA validation only hardens
// the future populated path: Intl.DateTimeFormat throws RangeError on a bad
// zone name, which would otherwise crash both the admin aggregate and the
// crew right-now path for that show.

export const DEFAULT_SHOW_TIMEZONE = "America/New_York";

// Index signature so the concrete ShowRow.venue object (name/address/… but
// no `timezone` field yet) is structurally assignable without a cast at call
// sites — and so TS's weak-type rule (all-optional object) does not reject it.
type VenueWithTz = { timezone?: string | null; [field: string]: unknown } | null | undefined;

export function resolveShowTimezone(venue: VenueWithTz): string {
  const raw = typeof venue?.timezone === "string" ? venue.timezone.trim() : "";
  if (raw.length === 0) return DEFAULT_SHOW_TIMEZONE;
  try {
    // Throws RangeError on an invalid IANA name.
    new Intl.DateTimeFormat("en-CA", { timeZone: raw });
    return raw;
  } catch {
    return DEFAULT_SHOW_TIMEZONE;
  }
}
