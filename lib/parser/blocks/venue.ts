import type { ShowRow } from "@/lib/parser/types";
import { resolveAlias } from "@/lib/parser/aliases";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse all markdown table rows into an array of cell arrays.
 * Each entry is the trimmed cells for one non-separator row.
 *
 * Separator/alignment rows are rows where EVERY inter-pipe segment contains
 * only `[\s:|*-]` characters (i.e., Markdown table alignment rows like
 * `| :---: | :-----------: |`). Rows with blank leading cells but meaningful
 * content in later cells (e.g., `|       | VENUE ADDRESS | 120 E ... |`)
 * are NOT separator rows and must be included.
 */
function parseTableRows(markdown: string): string[][] {
  const rows: string[][] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // A true separator row: every segment between pipes is purely [\s:|*-]
    const parts = trimmed.split("|");
    // segments are parts[1..length-2] (drop leading/trailing empty from split)
    const segments = parts.slice(1, parts.length - 1);
    const isSeparator = segments.every((seg) => /^[\s:|*-]*$/.test(seg));
    if (isSeparator) continue;
    const cells: string[] = [];
    for (const seg of segments) {
      cells.push(seg.trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** Normalize whitespace and strip markdown escape backslashes. */
function clean(s: string): string {
  return s.replace(/\\(.)/g, "$1").trim();
}

/** Return value if non-empty after cleaning, else null. */
function presence(s: string): string | null {
  const c = clean(s);
  return c.length > 0 ? c : null;
}

// ── VENUE block shapes across corpus ─────────────────────────────────────────
//
// v4 (2026-03, 2026-04, 2026-05): 2-column label/value rows
//
//   | VENUE NAME    | Four Seasons Hotel Chicago             |
//   | VENUE ADDRESS | 120 E Delaware Pl Chicago, IL 60611    |
//   | LOADING DOCK  | 64 East Walton St (Security ...)       |
//   | GOOGLE LINK   | https://maps.app.goo.gl/...            |
//
// v2 (2025-03, 2025-04, 2025-05, 2025-06, 2025-10): 3-column rows
//
//   | VENUE | VENUE NAME    | Four Seasons Hotel Chicago          |
//   |       | VENUE ADDRESS | 120 E Delaware Pl Chicago, IL 60611 |
//   |       | LOADING DOCK  | 64 East Walton St (...)             |
//   (no GOOGLE LINK in these fixtures)
//
// v1/v2 hybrid (2024-05): 2-column, different label names
//
//   | VENUE        | Four Seasons Fort Lauderdale |
//   | Hotel Address| 525 N Fort Lauderdale Beach Blvd |
//   | Loading Dock | Viramar Street Dock ...      |
//
// Note: 2025-10-fixed-income has | VENUE | VENUE NAME/VENUE ADDRESS | combined/value |
// which has a non-standard shape — we handle this via the VENUE NAME alias.
//
// Strategy: resolve cell labels via resolveAlias ("venue.name", "venue.address",
// "venue.loading_dock") to unify all shape variants without branching per version.
// The "VENUE" label itself (col 0 in v2) is a scope marker, not a value row.
// We skip it and look at col 1 (or col 0 in v4) for the actual field labels.

type VenueFields = NonNullable<ShowRow["venue"]>;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract the venue object from a show markdown sheet.
 *
 * Returns null if no venue block is found. Optional fields (loadingDock,
 * googleLink, notes) are omitted when not present in the sheet.
 *
 * @param markdown - Raw markdown string of the show sheet.
 * @param version  - Template version (v1 reuses v2 shape per amendment 4).
 */
export function parseVenue(markdown: string, version: "v1" | "v2" | "v4"): ShowRow["venue"] {
  const rows = parseTableRows(markdown);

  let name: string | null = null;
  let address: string | null = null;
  let loadingDock: string | null = null;
  let googleLink: string | null = null;
  let notes: string | null = null;

  // First-wins guard: once the show's primary venue block is found, ignore later rows
  // so that the large venue-reference tables later in the file don't clobber values.
  let anyVenueFieldSet = false;
  // Tracks whether we're inside a v2 3-column "VENUE" scope block specifically,
  // so blank-col0 continuation rows (| | VENUE ADDRESS | ... |) are attributed correctly.
  let inV2VenueBlock = false;

  for (const row of rows) {
    const col0 = row[0] ?? "";
    const col0Upper = col0.toUpperCase().trim();
    const col0Canon = resolveAlias(col0);

    // ── v2/v1 3-column scope block ──────────────────────────────────────────
    // Shape:  | VENUE |  VENUE NAME   | <value> |
    //         |       | VENUE ADDRESS | <value> |
    //         |       | LOADING DOCK  | <value> |
    // The "VENUE" row opens the block; blank-col0 continuation rows follow.
    if (col0Upper === "VENUE") {
      const subLabel = row[1] ?? "";
      const subCanon = resolveAlias(subLabel);

      if (row.length >= 3) {
        // v2 3-column shape: | VENUE | <field label> | <value> |
        const val = presence(row[2] ?? "");
        if (subCanon === "venue.name" && val && name === null) {
          name = val;
          anyVenueFieldSet = true;
        } else if (subCanon === "venue.address" && val && address === null) {
          address = val;
          anyVenueFieldSet = true;
        } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
          loadingDock = val;
          anyVenueFieldSet = true;
        } else if (subCanon === null && presence(subLabel) !== null && name === null) {
          // col1 doesn't resolve to a field label but is non-empty — treat as venue name
          name = presence(subLabel);
          anyVenueFieldSet = true;
        }
      } else {
        // v1-hybrid 2-column shape: | VENUE | <raw name> |
        // col1 is the venue name directly
        if (presence(subLabel) !== null && name === null) {
          name = presence(subLabel);
          anyVenueFieldSet = true;
        }
      }
      inV2VenueBlock = true;
      continue;
    }

    // Blank-col0 continuation rows for the v2 block
    if (col0 === "" && inV2VenueBlock && row.length >= 3) {
      const subLabel = row[1] ?? "";
      const subCanon = resolveAlias(subLabel);
      const val = presence(row[2] ?? "");
      if (subCanon === "venue.address" && val && address === null) {
        address = val;
        anyVenueFieldSet = true;
      } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
        loadingDock = val;
        anyVenueFieldSet = true;
      }
      continue;
    }

    // Once we leave the v2 block (non-blank col0 that isn't a blank continuation),
    // stop tracking v2 block context. The large reference tables also use "VENUE"
    // in col0 but they open a new block — the first-wins guard on individual fields
    // (name === null, address === null, etc.) prevents clobbering.
    if (col0 !== "" && col0Upper !== "VENUE") {
      inV2VenueBlock = false;
    }

    // ── v4 / v1-hybrid 2-column shape ──────────────────────────────────────
    // Shape:  | VENUE NAME    | <value> |
    //         | VENUE ADDRESS | <value> |
    //         | LOADING DOCK  | <value> |
    //         | GOOGLE LINK   | <value> |
    if (col0Canon === "venue.name") {
      const val = presence(row[1] ?? "");
      // Guard: if col1 resolves to a field label, this is a multi-column header row
      // (the venue-reference table), not a value row — skip it.
      const valCanon = val !== null ? resolveAlias(val) : null;
      if (val && valCanon === null && name === null) {
        name = val;
        anyVenueFieldSet = true;
      }
      continue;
    }
    if (col0Canon === "venue.address") {
      const val = presence(row[1] ?? "");
      const valCanon = val !== null ? resolveAlias(val) : null;
      if (val && valCanon === null && address === null && anyVenueFieldSet) {
        address = val;
      }
      continue;
    }
    if (col0Canon === "venue.loading_dock") {
      const val = presence(row[1] ?? "");
      if (val && loadingDock === null && anyVenueFieldSet) {
        loadingDock = val;
      }
      continue;
    }

    // GOOGLE LINK — not in FIELD_ALIASES, matched directly
    if (col0Upper === "GOOGLE LINK") {
      const val = presence(row[1] ?? "");
      if (val && googleLink === null && anyVenueFieldSet) {
        googleLink = val;
      }
      continue;
    }

    // VENUE NOTES — direct match
    if (col0Upper === "VENUE NOTES") {
      const val = presence(row[1] ?? "");
      if (val && notes === null && anyVenueFieldSet) {
        notes = val;
      }
      continue;
    }
  }

  if (!name) return null;

  // address is required by the type — if we found a name but no address, use empty string
  // per null-safety rule: soft warning is Task 1.10's responsibility
  const venueAddress = address ?? "";

  const result: VenueFields = {
    name,
    address: venueAddress,
    ...(loadingDock !== null ? { loadingDock } : {}),
    ...(googleLink !== null ? { googleLink } : {}),
    ...(notes !== null ? { notes } : {}),
  };

  return result;
}
