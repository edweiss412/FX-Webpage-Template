import type { ShowRow } from "@/lib/parser/types";
import { resolveAlias, resolveAliasFull } from "@/lib/parser/aliases";
import type { ParseAggregator } from "@/lib/parser/warnings";
import { presence, parseTableRows } from "./_helpers";

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
 *                   Preserved for API consistency with the sheet orchestrator
 *                   (Task 1.11: parseSheet calls parseVenue(md, detectVersion(md)!)).
 *                   Alias-based dispatch handles all versions identically, so
 *                   the parameter is not read internally.
 */
 
export function parseVenue(
  markdown: string,
  version: "v1" | "v2" | "v4",
  agg?: ParseAggregator,
): ShowRow["venue"] {
  const rows = parseTableRows(markdown);

  let name: string | null = null;
  let address: string | null = null;
  let loadingDock: string | null = null;
  let googleLink: string | null = null;
  let notes: string | null = null;

  // Tracks whether we're inside a v2 3-column "VENUE" scope block specifically,
  // so blank-col0 continuation rows (| | VENUE ADDRESS | ... |) are attributed correctly.
  let inV2VenueBlock = false;

  // UNKNOWN_FIELD scope guard: true once we've resolved the first venue field;
  // set to false when we encounter a known block-terminator header row so we
  // don't false-positive on other blocks' rows that appear later in the document.
  let inVenueFieldScope = false;

  // Block headers that signal we've left the venue block entirely.
  // These are strong v4/v2/v1 block-opener labels (all-caps or well-known names).
  const VENUE_BLOCK_TERMINATORS = new Set([
    "CREW",
    "TECH",
    "DATES",
    "TRANSPORTATION",
    "HOTEL",
    "HOTELS",
    "ROOMS",
    "CONTACTS",
    "DETAILS",
    "EVENT DETAILS",
    "GS DETAILS",
    "PULL SHEET",
    "PULL",
    "DIAGRAMS",
    "CLIENT",
    "SCHEDULE",
  ]);

  for (const row of rows) {
    const col0 = row[0] ?? "";
    const col0Upper = col0.toUpperCase().trim();
    const col0Full = resolveAliasFull(col0);
    const col0Canon = col0Full?.canonical ?? null;

    // Check for block terminators — if we see a strong block-opener label, leave
    // the venue field scope so UNKNOWN_FIELD stops firing for other blocks' rows.
    // Use prefix matching since some headers include slashes (e.g. "TRANSPORTATION/Equipment Transporter").
    if (col0 !== "" && inVenueFieldScope) {
      const upperTrimmed = col0Upper;
      const isTerminator =
        VENUE_BLOCK_TERMINATORS.has(upperTrimmed) ||
        [...VENUE_BLOCK_TERMINATORS].some(
          (t) => upperTrimmed.startsWith(t + "/") || upperTrimmed.startsWith(t + " "),
        );
      if (isTerminator) {
        inVenueFieldScope = false;
      }
    }

    // Emit TYPO_NORMALIZED if col0 matched a known-typo alias (only within venue scope)
    if (col0Full?.isTypo && agg && inVenueFieldScope) {
      agg.warnings.push({
        severity: "info",
        code: "TYPO_NORMALIZED",
        message: `Typo alias '${col0.trim()}' normalized to canonical '${col0Full.canonical}'`,
        blockRef: { kind: "venue" },
        rawSnippet: col0.trim(),
      });
    }

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
          inVenueFieldScope = true;
        } else if (subCanon === "venue.address" && val && address === null) {
          address = val;
          inVenueFieldScope = true;
        } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
          loadingDock = val;
          inVenueFieldScope = true;
        } else if (subCanon === null && presence(subLabel) !== null && name === null) {
          // col1 doesn't resolve to a field label but is non-empty.
          // Special case: "VENUE NAME/VENUE ADDRESS" combined label — split value on first '/'.
          if (subLabel.match(/VENUE NAME\s*\/\s*VENUE ADDRESS/i) && val) {
            const slashIdx = val.indexOf("/");
            if (slashIdx > 0 && slashIdx < val.length - 1) {
              name = presence(val.slice(0, slashIdx));
              address = presence(val.slice(slashIdx + 1));
            } else {
              // No valid slash split — fall back to full value as name
              name = val;
            }
          } else {
            // col1 doesn't resolve to a field label — treat col2 as venue name.
            // Fix 1: use `val` (the value cell, col2) not `presence(subLabel)` (the label cell, col1).
            name = val;
          }
        }
      } else {
        // v1-hybrid 2-column shape: | VENUE | <raw name> |
        // col1 is the venue name directly
        if (presence(subLabel) !== null && name === null) {
          name = presence(subLabel);
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
        inVenueFieldScope = true;
      } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
        loadingDock = val;
        inVenueFieldScope = true;
      } else if (subCanon === "venue.google_link" && val && googleLink === null) {
        googleLink = val;
        inVenueFieldScope = true;
      } else if (subCanon === "venue.notes" && val && notes === null) {
        notes = val;
        inVenueFieldScope = true;
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
        inVenueFieldScope = true;
      }
      continue;
    }
    if (col0Canon === "venue.address") {
      const val = presence(row[1] ?? "");
      const valCanon = val !== null ? resolveAlias(val) : null;
      // Fix 4: anyVenueFieldSet guard removed — the valCanon===null check already
      // protects against reference-table header rows. No ordering requirement.
      if (val && valCanon === null && address === null) {
        address = val;
        inVenueFieldScope = true;
      }
      continue;
    }
    if (col0Canon === "venue.loading_dock") {
      const val = presence(row[1] ?? "");
      // Fix 4: anyVenueFieldSet guard removed — no ordering requirement.
      if (val && loadingDock === null) {
        loadingDock = val;
        inVenueFieldScope = true;
      }
      continue;
    }

    // GOOGLE LINK — dispatched via canonical alias (Fix 6)
    if (col0Canon === "venue.google_link") {
      const val = presence(row[1] ?? "");
      // Fix 4: anyVenueFieldSet guard removed — no ordering requirement.
      if (val && googleLink === null) {
        googleLink = val;
        inVenueFieldScope = true;
      }
      continue;
    }

    // VENUE NOTES — dispatched via canonical alias (Fix 6)
    if (col0Canon === "venue.notes") {
      const val = presence(row[1] ?? "");
      // Fix 4: anyVenueFieldSet guard removed — no ordering requirement.
      if (val && notes === null) {
        notes = val;
        inVenueFieldScope = true;
      }
      continue;
    }

    // UNKNOWN_FIELD: col0 is non-empty, not a scope marker ("VENUE"), not a
    // blank-continuation row, resolves to no canonical, AND we are inside the
    // active venue field scope (at least one venue field seen, block not yet
    // terminated by a known block-opener).
    if (agg && inVenueFieldScope && col0 !== "" && col0Upper !== "VENUE" && col0Canon === null) {
      const rawVal = presence(row[1] ?? "") ?? "";
      agg.warnings.push({
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: `Unrecognized venue row label: '${col0.trim()}'`,
        blockRef: { kind: "venue" },
        rawSnippet: `${col0.trim()} | ${rawVal}`,
      });
      agg.rawUnrecognized.push({
        block: "venue",
        key: col0.trim(),
        value: rawVal,
      });
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
