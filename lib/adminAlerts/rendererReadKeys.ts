// lib/adminAlerts/rendererReadKeys.ts
//
// Which `admin_alerts.context` keys a code's RENDERED card actually reads
// (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §5).
//
// A card's visible copy is interpolated from its resolved AlertIdentity, not
// from raw context, so "which keys matter for rendering" is a property of
// ALERT_IDENTITY_MAP rather than of the producer. A fixture that omits one of
// these keys renders the placeholder form ("some sheets", "a crew member",
// "this show") instead of real values — the degenerate state this spec exists
// to eliminate.
//
// The `count` mapping is the subtle one and the reason "any key backing a
// placeholder" was too vague to implement: a count key like
// `crew_member_count` NEVER appears in a producer's context. It is projected
// from `crew_member_ids.length` (lib/adminAlerts/projectIdentityContext.ts:101),
// so the key a fixture must supply is the UNDERLYING array, not the count.
import { ALERT_IDENTITY_MAP, type SegmentSpec } from "@/lib/adminAlerts/alertIdentityMap";

/** Per-code email source. OAuth's canonical address lives in `user_email`;
 *  every other email-bearing code reads `email`
 *  (lib/adminAlerts/resolveAlertIdentities.ts:69-72). */
const EMAIL_FIELD_BY_CODE: Record<string, string> = {
  OAUTH_IDENTITY_CLAIMED: "user_email",
};

/** Some `contextField` segments name a PROJECTED display field rather than a
 *  raw producer key. `role_change_crew_names` is built from `ctx.changes[].crew_name`
 *  (lib/adminAlerts/projectIdentityContext.ts:88-97), so a fixture supplies
 *  `changes`, never the projected name list. Fields absent here are read
 *  straight off the context (e.g. `failed_sheet_names`,
 *  lib/adminAlerts/projectIdentityContext.ts:107). */
const CONTEXT_FIELD_UNDERLYING_KEY: Record<string, string> = {
  role_change_crew_names: "changes",
};

/** Count segments are projected from an underlying context value
 *  (lib/adminAlerts/projectIdentityContext.ts:88-101); the fixture supplies
 *  that value, never the count itself. */
const COUNT_UNDERLYING_KEY: Record<string, string> = {
  crew_member_count: "crew_member_ids",
  role_change_count: "changes",
  failed_sheet_names_count: "failed_sheet_names",
};

/** Every `SegmentSpec["kind"]` this module knows how to map. A structural test
 *  asserts this covers the live union, so a NEW segment kind fails loudly
 *  instead of silently contributing no required key. */
export const HANDLED_SEGMENT_KINDS = [
  "showName",
  "sheetName",
  "email",
  "crewName",
  "contextField",
  "count",
] as const;

function keyForSegment(code: string, seg: SegmentSpec): string | undefined {
  switch (seg.kind) {
    case "showName":
    case "sheetName":
      // Both resolve through the show lookup, not through a context key:
      // resolveShowSegment reads the row's `show_id` COLUMN, falling back to
      // `context.drive_file_id` only when that column is null
      // (lib/adminAlerts/resolveAlertIdentities.ts:230-244). `sheetName` is the
      // same resolver with a "Sheet" label. There is no per-code required key
      // here, so both contribute nothing.
      return undefined;
    case "email":
      return EMAIL_FIELD_BY_CODE[code] ?? "email";
    case "crewName":
      return "key" in seg ? seg.key : undefined;
    case "contextField": {
      if (!("key" in seg) || seg.key === undefined) return undefined;
      return CONTEXT_FIELD_UNDERLYING_KEY[seg.key] ?? seg.key;
    }
    case "count": {
      if (!("key" in seg) || seg.key === undefined) return undefined;
      return COUNT_UNDERLYING_KEY[seg.key] ?? seg.key;
    }
    default:
      return undefined;
  }
}

/**
 * The context keys `code`'s card reads when rendering. Empty for a code whose
 * copy interpolates nothing from context — those fixtures may legally carry
 * `{}`.
 */
/** Exposed so a test can assert every projected display field is either a raw
 *  producer key or carries an indirection entry — a new projected field must
 *  not silently become a bogus fixture requirement. */
export const PROJECTED_CONTEXT_FIELDS: ReadonlyMap<string, string> = new Map(
  Object.entries(CONTEXT_FIELD_UNDERLYING_KEY),
);

export function rendererReadKeys(code: string): string[] {
  const entry = ALERT_IDENTITY_MAP[code];
  if (!entry || !("segments" in entry) || !Array.isArray(entry.segments)) return [];
  const out = new Set<string>();
  for (const seg of entry.segments) {
    const key = keyForSegment(code, seg);
    if (key !== undefined) out.add(key);
  }
  return [...out].sort();
}
