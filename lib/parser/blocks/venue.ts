import type { ShowRow } from "@/lib/parser/types";
import { resolveAlias, resolveAliasFull, resolveAliasScoped } from "@/lib/parser/aliases";
import type { ParseAggregator } from "@/lib/parser/warnings";
import { presence } from "./_helpers";
import { scanRowsWithOpener } from "./_rowScan";
import { matchesSectionHeader } from "./_sectionHeaderMatch";

export const SECTION_HEADER_TOKENS = ["VENUE"] as const;

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
  const rows = scanRowsWithOpener(markdown);

  let name: string | null = null;
  let address: string | null = null;
  let loadingDock: string | null = null;
  let googleLink: string | null = null;
  let notes: string | null = null;

  // Tracks whether we're inside a v2 3-column "VENUE" scope block specifically,
  // so blank-col0 continuation rows (| | VENUE ADDRESS | ... |) are attributed correctly.
  let inV2VenueBlock = false;

  for (const { cells: row, opener } of rows) {
    const col0 = row[0] ?? "";
    const col0Upper = col0.toUpperCase().trim();
    const col0Full = resolveAliasFull(col0);
    let col0Canon = col0Full?.canonical ?? null;
    // Scoped fuzzy fallback (spec §5.2): a misspelled venue field label that exact-resolves
    // to nothing is recovered to its canonical, so it drives field assignment AND skips the
    // UNKNOWN_FIELD branch below (which only fires when col0Canon === null). resolveAliasScoped
    // is venue-scoped: it never borrows another block's canonical.
    let fieldLabelCorrectedTo: string | null = null;
    if (col0Canon === null && col0.trim() !== "") {
      const fuzzy = resolveAliasScoped(col0, "venue.");
      if (fuzzy?.corrected) {
        col0Canon = fuzzy.canonical;
        fieldLabelCorrectedTo = fuzzy.canonical;
      }
    }

    // TYPO_NORMALIZED is gated on VENUE-BLOCK MEMBERSHIP (field-near-miss spec §2.1),
    // not on the retired positional scope window. The predicate is the one the near-miss
    // detector's anchor-namespace mapping uses for its "venue" arm — same helper, same
    // token set — so a row's block reads identically on both sides. Content-keyed, so it
    // is swap-invariant: the opener text moves with its rows.
    //
    // Consequence, deliberate: a v4 two-column sheet opens its venue table on `VENUE NAME`
    // rather than a standalone `VENUE` cell, so those rows are NOT the "venue" namespace
    // and a typo alias sitting in one stays silent. The corpus census is 0 either way
    // (every `Hotal Contact Info` row sits in a hotel block), which is the ratified
    // outcome; the emission stays REACHABLE through the v2 three-column shape.
    const inVenueBlock = matchesSectionHeader(opener, SECTION_HEADER_TOKENS);

    // Emit TYPO_NORMALIZED if col0 matched a known-typo alias inside the venue block.
    if (col0Full?.isTypo && agg && inVenueBlock) {
      agg.warnings.push({
        severity: "info",
        code: "TYPO_NORMALIZED",
        message: `Typo alias '${col0.trim()}' normalized to canonical '${col0Full.canonical}'`,
        blockRef: { kind: "venue" },
        rawSnippet: col0.trim(),
      });
    }

    // Emit FIELD_LABEL_AUTOCORRECTED (warn, deep-linked) when the scoped fuzzy fallback
    // recovered a misspelled label — preserving venue's operator visibility (NOT the silent
    // info downgrade). `message` is the internal admin diagnostic; the user sees the catalog
    // copy ("Auto-corrected a field label"). canonical is the precise internal identifier.
    // NOTE: intentionally UNGATED — no block-membership test, no scope test.
    // `fieldLabelCorrectedTo` is row-local (re-declared null each iteration, above) and is
    // set ONLY when the venue-scoped `resolveAliasScoped(col0, "venue.")` returns a
    // `corrected` hit — so a non-null value already proves a venue field-label correction
    // happened on THIS row. The retired positional gate (which the field-assignment
    // branches below only flipped true AFTER this check) silently suppressed the warn for a
    // misspelled FIRST venue field row (idx53) — a silent re-route, violating spec §2 rule 4
    // "always warn". The TYPO_NORMALIZED emit above keeps a gate; this one must not.
    if (fieldLabelCorrectedTo && agg) {
      agg.warnings.push({
        severity: "warn",
        code: "FIELD_LABEL_AUTOCORRECTED",
        message: `Read likely-misspelled field label '${col0.trim()}' as field '${fieldLabelCorrectedTo}'`,
        blockRef: { kind: "venue" },
        rawSnippet: col0.trim(),
        autocorrect: {
          subject: null,
          corrections: [{ detected: col0.trim(), corrected: fieldLabelCorrectedTo }],
        },
      });
    }

    // ── v2/v1 3-column scope block ──────────────────────────────────────────
    // Shape:  | VENUE |  VENUE NAME   | <value> |
    //         |       | VENUE ADDRESS | <value> |
    //         |       | LOADING DOCK  | <value> |
    // The "VENUE" row opens the block; blank-col0 continuation rows follow.
    if (matchesSectionHeader(col0, SECTION_HEADER_TOKENS)) {
      const subLabel = row[1] ?? "";
      const subCanon = resolveAlias(subLabel);

      if (row.length >= 3) {
        // v2 3-column shape: | VENUE | <field label> | <value> |
        const val = presence(row[2] ?? "");
        if (subCanon === "venue.name" && val && name === null) {
          name = val;
        } else if (subCanon === "venue.address" && val && address === null) {
          address = val;
        } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
          loadingDock = val;
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
      } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
        loadingDock = val;
      } else if (subCanon === "venue.google_link" && val && googleLink === null) {
        googleLink = val;
      } else if (subCanon === "venue.notes" && val && notes === null) {
        notes = val;
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
      }
      continue;
    }
    if (col0Canon === "venue.loading_dock") {
      const val = presence(row[1] ?? "");
      // Fix 4: anyVenueFieldSet guard removed — no ordering requirement.
      if (val && loadingDock === null) {
        loadingDock = val;
      }
      continue;
    }

    // GOOGLE LINK — dispatched via canonical alias (Fix 6)
    if (col0Canon === "venue.google_link") {
      const val = presence(row[1] ?? "");
      // Fix 4: anyVenueFieldSet guard removed — no ordering requirement.
      if (val && googleLink === null) {
        googleLink = val;
      }
      continue;
    }

    // VENUE NOTES — dispatched via canonical alias (Fix 6)
    if (col0Canon === "venue.notes") {
      const val = presence(row[1] ?? "");
      // Fix 4: anyVenueFieldSet guard removed — no ordering requirement.
      if (val && notes === null) {
        notes = val;
      }
      continue;
    }

    // NO UNKNOWN_FIELD here. The positional scope window this file used to carry — open at
    // the first resolved venue field, close at a terminator label — swept ~380 junk rows
    // out of neighbouring blocks and changed its emission set whenever a block moved.
    // `detectFieldNearMisses` (lib/parser/fieldNearMiss.ts), called once at the document
    // seam in lib/parser/index.ts, owns the code now and keys on row CONTENT alone.
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

// TRANSFORM_SITES (spec 2026-07-07-ambiguity-warnings-v1 §6) — value-producing
// transform sites in this file that rest on a JUDGMENT the parser could get wrong.
// None here — venue fields captured verbatim.
export const TRANSFORM_SITES: ReadonlyArray<
  { site: string; code: string } | { site: string; exempt: string }
> = [];
